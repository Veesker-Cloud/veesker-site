---
title: "Building Oracle 23ai vector RAG: from embeddings to ORDS endpoints"
description: "A practical walkthrough of Oracle 23ai's VECTOR type, VECTOR_DISTANCE queries, HNSW indexes, and ORDS REST endpoints — the full RAG pipeline without leaving the database."
date: "2026-06-01"
slug: "oracle-23ai-vector-rag-embeddings-to-ords"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "vector-search", "rag", "ords", "23ai"]
translation_slug: "oracle-23ai-vector-rag-embeddings-ao-ords"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

RAG — Retrieval-Augmented Generation — is the pattern that makes LLMs useful on private knowledge. Instead of fine-tuning, you embed your documents once, store the vectors, and at query time you retrieve the top-k nearest chunks and hand them to the model as context. The model's job is synthesis, not memorization.

Most RAG tutorials assume a Python stack, a vector store you have never heard of, and an embedding API billed by the token. Oracle 23ai makes a different offer: the vector store is your existing database, the similarity search is SQL, and the REST layer is ORDS — the same service your team probably already runs. If your source documents live in Oracle, the shortest path to a working RAG endpoint is not a new infrastructure component. It is a few DDL statements and an ORDS handler.

## The VECTOR data type

Oracle 23ai introduced `VECTOR` as a first-class column type. A vector column stores a fixed-dimension array of floating-point values — the numeric representation of a document chunk, an image, or any item your embedding model encodes.

```sql
CREATE TABLE kb_chunks (
  id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_doc  VARCHAR2(512),
  chunk_text  CLOB,
  embedding   VECTOR(1536, FLOAT32)
);
```

The two parameters — `1536` and `FLOAT32` — declare the dimension count and numeric format. Match these to your embedding model. OpenAI's `text-embedding-3-small` produces 1536-dimensional `FLOAT32` vectors. If you import an ONNX model into the database via `DBMS_VECTOR.LOAD_ONNX_MODEL`, configure the dimension to match the model's declared output size.

You can omit both parameters (`VECTOR(*)`) to allow variable-dimension storage, but fixed dimensions are required by the index types that matter for production query latency.

## Populating vectors

If you generate embeddings externally — from an API or a locally running model — the insertion path is ordinary SQL with the `TO_VECTOR()` cast:

```sql
INSERT INTO kb_chunks (source_doc, chunk_text, embedding)
VALUES (
  'ops-runbook-2026.pdf',
  'Restart the listener with: lsnrctl stop / lsnrctl start',
  TO_VECTOR('[0.021, -0.134, 0.887, ...]', 1536, FLOAT32)
);
```

If you have loaded an ONNX embedding model into the database, Oracle can generate the embedding inline at insert time using `VECTOR_EMBEDDING()`:

```sql
INSERT INTO kb_chunks (source_doc, chunk_text, embedding)
SELECT
  'ops-runbook-2026.pdf',
  chunk_text,
  VECTOR_EMBEDDING(my_embed_model USING chunk_text AS data)
FROM staging_chunks;
```

`DBMS_VECTOR.LOAD_ONNX_MODEL` is the procedure that installs the ONNX model into the database schema. The model file moves from your filesystem into the `DBMS_DATA_MINING` model store, then is referenced by name in `VECTOR_EMBEDDING()`. Embedding generation happens inside the Oracle process — no outbound HTTP call, no external service dependency at insert time. This matters if your environment has outbound network restrictions, which Oracle installations frequently do.

## Similarity search

The retrieval half of RAG requires a nearest-neighbor query: given a query vector, find the k rows whose stored vectors are closest. In Oracle 23ai, that is `VECTOR_DISTANCE()`:

```sql
SELECT
  chunk_text,
  source_doc,
  VECTOR_DISTANCE(embedding, :query_vector, COSINE) AS score
FROM kb_chunks
ORDER BY score
FETCH FIRST 10 ROWS ONLY;
```

The third argument to `VECTOR_DISTANCE` is the distance metric: `COSINE`, `EUCLIDEAN`, `DOT`, or `MANHATTAN`. Cosine similarity is the standard for text embeddings — it is invariant to vector magnitude, which matters when chunk lengths vary. A lower cosine distance means higher semantic similarity.

At small table sizes, a full scan with `VECTOR_DISTANCE` is fast enough. For production scale, you want an approximate-nearest-neighbor index:

```sql
CREATE VECTOR INDEX kb_hnsw_idx ON kb_chunks(embedding)
  ORGANIZATION INMEMORY NEIGHBOR GRAPH
  DISTANCE COSINE
  WITH TARGET ACCURACY 95;
```

`ORGANIZATION INMEMORY NEIGHBOR GRAPH` is the HNSW (Hierarchical Navigable Small World) index type — the de-facto standard algorithm in most purpose-built vector stores. `TARGET ACCURACY 95` tells Oracle to trade a small fraction of recall for a large reduction in search latency. The optimizer picks this index automatically when it sees the `VECTOR_DISTANCE(...) ORDER BY ... FETCH FIRST` pattern.

Oracle also supports IVF (Inverted File) partitioned indexes for larger, batch-heavy datasets:

```sql
CREATE VECTOR INDEX kb_ivf_idx ON kb_chunks(embedding)
  ORGANIZATION NEIGHBOR PARTITIONS
  DISTANCE COSINE
  WITH TARGET ACCURACY 90;
```

HNSW gives better query latency on read-heavy workloads. IVF handles large-scale batch ingestion more gracefully because it does not require maintaining a graph structure across inserts. The right choice depends on your update frequency and whether your vector table is built once or updated continuously.

## Exposing the search over ORDS

A similarity search query sitting in a SQL window is not a RAG endpoint. The LLM client needs to call something over HTTP. ORDS (Oracle REST Data Services) turns a PL/SQL handler into an HTTP endpoint in minutes.

Define a module and handler using the `ORDS` PL/SQL API:

```sql
BEGIN
  ORDS.DEFINE_MODULE(
    p_module_name    => 'kb',
    p_base_path      => '/kb/',
    p_is_published   => TRUE
  );

  ORDS.DEFINE_TEMPLATE(
    p_module_name => 'kb',
    p_pattern     => 'search'
  );

  ORDS.DEFINE_HANDLER(
    p_module_name  => 'kb',
    p_pattern      => 'search',
    p_method       => 'POST',
    p_source_type  => ORDS.source_type_collection_feed,
    p_source       => q'[
      SELECT chunk_text, source_doc,
             VECTOR_DISTANCE(
               embedding,
               TO_VECTOR(:query_vector, 1536, FLOAT32),
               COSINE
             ) AS score
      FROM   kb_chunks
      ORDER  BY score
      FETCH  FIRST :top_k ROWS ONLY
    ]'
  );
  COMMIT;
END;
```

After this block executes, `POST /ords/{schema}/kb/search` accepts a JSON body with `query_vector` (a JSON array of floats serialized as a string) and `top_k` (integer), and returns a JSON collection of matching chunks. The bind variable syntax — `:query_vector`, `:top_k` — is standard ORDS parameter binding. No string concatenation, no SQL injection surface.

The LLM client calls this endpoint, receives the retrieved chunks as JSON, assembles them as context, and passes that context to the model alongside the user's question. The database handles storage, indexing, and retrieval. The model handles language. Neither reaches into the other's domain.

## Filtering before the vector step

Pure vector search returns the most semantically similar rows, but production RAG often needs a pre-filter: return only chunks from documents published after a certain date, or belonging to a specific project, or visible to the current user. Oracle 23ai supports combining a standard `WHERE` predicate with `VECTOR_DISTANCE`:

```sql
SELECT chunk_text, source_doc,
       VECTOR_DISTANCE(embedding, :query_vector, COSINE) AS score
FROM   kb_chunks
WHERE  source_doc LIKE :doc_prefix || '%'
ORDER  BY score
FETCH  FIRST :top_k ROWS ONLY;
```

The optimizer can apply the filter before the vector scan when selectivity is high, which means you are doing approximate nearest-neighbor search over a smaller set. This is one of the structural advantages of keeping vectors inside a relational engine: you can combine vector predicates with arbitrary SQL predicates in a single query plan, rather than coordinating between a vector store and a relational database at the application layer.

## What Veesker adds to this workflow

If you open a 23ai connection in Veesker, the schema browser recognizes `VECTOR` columns and displays their declared dimension and format. The AI context for that connection includes the detected server version, so when you ask the AI to scaffold a similarity search query, it produces `VECTOR_DISTANCE` and `FETCH FIRST` rather than syntax appropriate for a different database or an older Oracle version.

The ORDS handler DDL above is exactly the kind of block the AI layer can generate against your actual schema — it reads the table name, the vector column's dimension, and the declared distance metric from the live connection, not from a generic template. Veesker is local-first by design: the schema inspection runs inside your network, and the IDE never phones home.

The Cloud layer (coming H2 2026) adds a feedback loop between `EXPLAIN PLAN` output and the AI. For vector queries, this is relevant: if the HNSW index is not being picked up, the plan shows a full scan, and the AI can suggest why — wrong distance metric in the index versus the query, a missing cast, a `WHERE` predicate that prevents index use — before you push to production.

## Closing

Oracle 23ai's vector support is not a wrapper around an external vector database. The `VECTOR` type, `VECTOR_DISTANCE`, and the HNSW and IVF index types are native to the same engine that holds your application data. For teams that already run Oracle and already run ORDS, the path from zero to a working RAG endpoint is measurably shorter than the multi-service architecture most tutorials describe.

If you want to explore the `VECTOR` type and `VECTOR_DISTANCE` on a live 23ai connection, [download Veesker](/download) — schema browsing, AI grounding, and ORDS handler scaffolding are all in the Community Edition, Apache 2.0, free to use.

— *Veesker*
