---
title: "Construindo vector RAG no Oracle 23ai: de embeddings a endpoints ORDS"
description: "Um guia prático pelo tipo VECTOR do Oracle 23ai, consultas VECTOR_DISTANCE, índices HNSW e endpoints REST ORDS — o pipeline RAG completo sem sair do banco de dados."
date: "2026-06-01"
slug: "oracle-23ai-vector-rag-embeddings-ao-ords"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "vector-search", "rag", "ords", "23ai"]
translation_slug: "oracle-23ai-vector-rag-embeddings-to-ords"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

RAG — Retrieval-Augmented Generation — é o padrão que torna LLMs úteis sobre conhecimento privado. Em vez de fine-tuning, você embedda seus documentos uma vez, armazena os vetores e, no momento da consulta, recupera os k chunks mais próximos e os entrega ao modelo como contexto. O papel do modelo é sintetizar, não memorizar.

A maioria dos tutoriais de RAG pressupõe uma stack Python, um banco de vetores que você nunca ouviu falar e uma API de embeddings cobrada por token. O Oracle 23ai faz uma oferta diferente: o banco de vetores é o seu banco de dados existente, a busca por similaridade é SQL e a camada REST é o ORDS — o mesmo serviço que seu time provavelmente já roda. Se os documentos-fonte vivem no Oracle, o caminho mais curto para um endpoint RAG funcional não é um novo componente de infraestrutura. São alguns comandos DDL e um handler ORDS.

## O tipo de dado VECTOR

O Oracle 23ai introduziu `VECTOR` como um tipo de coluna nativo. Uma coluna vetorial armazena um array de valores em ponto flutuante com dimensão fixa — a representação numérica de um chunk de documento, uma imagem ou qualquer item que seu modelo de embedding codifique.

```sql
CREATE TABLE kb_chunks (
  id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_doc  VARCHAR2(512),
  chunk_text  CLOB,
  embedding   VECTOR(1536, FLOAT32)
);
```

Os dois parâmetros — `1536` e `FLOAT32` — declaram a quantidade de dimensões e o formato numérico. Combine com o seu modelo de embedding. O `text-embedding-3-small` da OpenAI produz vetores `FLOAT32` de 1536 dimensões. Se você importar um modelo ONNX para o banco via `DBMS_VECTOR.LOAD_ONNX_MODEL`, configure a dimensão para corresponder ao tamanho de saída declarado pelo modelo.

Você pode omitir ambos os parâmetros (`VECTOR(*)`) para permitir armazenamento com dimensões variáveis, mas dimensões fixas são exigidas pelos tipos de índice que importam para latência de consulta em produção.

## Populando vetores

Se você gera embeddings externamente — a partir de uma API ou de um modelo rodando localmente — o caminho de inserção é SQL comum com o cast `TO_VECTOR()`:

```sql
INSERT INTO kb_chunks (source_doc, chunk_text, embedding)
VALUES (
  'runbook-ops-2026.pdf',
  'Reinicie o listener com: lsnrctl stop / lsnrctl start',
  TO_VECTOR('[0.021, -0.134, 0.887, ...]', 1536, FLOAT32)
);
```

Se você carregou um modelo ONNX de embedding no banco, o Oracle pode gerar o embedding inline no momento da inserção usando `VECTOR_EMBEDDING()`:

```sql
INSERT INTO kb_chunks (source_doc, chunk_text, embedding)
SELECT
  'runbook-ops-2026.pdf',
  chunk_text,
  VECTOR_EMBEDDING(meu_modelo_embed USING chunk_text AS data)
FROM staging_chunks;
```

`DBMS_VECTOR.LOAD_ONNX_MODEL` é o procedimento que instala o modelo ONNX no schema do banco. O arquivo do modelo migra do seu sistema de arquivos para o repositório de modelos `DBMS_DATA_MINING`, e então é referenciado pelo nome em `VECTOR_EMBEDDING()`. A geração do embedding acontece dentro do processo Oracle — sem chamada HTTP de saída, sem dependência de serviço externo no momento da inserção. Isso importa se o seu ambiente tem restrições de rede de saída, o que instalações Oracle frequentemente têm.

## Busca por similaridade

A metade de recuperação do RAG exige uma consulta de vizinho mais próximo: dado um vetor de consulta, encontrar as k linhas cujos vetores armazenados são mais próximos. No Oracle 23ai, isso é feito com `VECTOR_DISTANCE()`:

```sql
SELECT
  chunk_text,
  source_doc,
  VECTOR_DISTANCE(embedding, :query_vector, COSINE) AS score
FROM kb_chunks
ORDER BY score
FETCH FIRST 10 ROWS ONLY;
```

O terceiro argumento de `VECTOR_DISTANCE` é a métrica de distância: `COSINE`, `EUCLIDEAN`, `DOT` ou `MANHATTAN`. A similaridade de cosseno é o padrão para embeddings de texto — ela é invariante à magnitude do vetor, o que importa quando os tamanhos dos chunks variam. Uma distância de cosseno menor significa maior similaridade semântica.

Em tabelas pequenas, um full scan com `VECTOR_DISTANCE` é suficientemente rápido. Para escala de produção, você precisa de um índice de vizinho mais próximo aproximado:

```sql
CREATE VECTOR INDEX kb_hnsw_idx ON kb_chunks(embedding)
  ORGANIZATION INMEMORY NEIGHBOR GRAPH
  DISTANCE COSINE
  WITH TARGET ACCURACY 95;
```

`ORGANIZATION INMEMORY NEIGHBOR GRAPH` é o tipo de índice HNSW (Hierarchical Navigable Small World) — o algoritmo padrão na maioria dos bancos de vetores especializados. `TARGET ACCURACY 95` instrui o Oracle a trocar uma pequena fração de revocação por uma grande redução na latência de busca. O otimizador usa esse índice automaticamente quando detecta o padrão `VECTOR_DISTANCE(...) ORDER BY ... FETCH FIRST`.

O Oracle também suporta índices IVF (Inverted File) particionados para conjuntos de dados maiores com ingestão em lote:

```sql
CREATE VECTOR INDEX kb_ivf_idx ON kb_chunks(embedding)
  ORGANIZATION NEIGHBOR PARTITIONS
  DISTANCE COSINE
  WITH TARGET ACCURACY 90;
```

HNSW oferece menor latência de consulta em cargas de trabalho com muitas leituras. IVF lida melhor com ingestão em lote de grande escala porque não requer manter uma estrutura de grafo através das inserções. A escolha certa depende da frequência de atualização e se sua tabela de vetores é construída uma vez ou atualizada continuamente.

## Expondo a busca via ORDS

Uma consulta de busca por similaridade em uma janela SQL não é um endpoint RAG. O cliente LLM precisa chamar algo via HTTP. O ORDS (Oracle REST Data Services) transforma um handler PL/SQL em um endpoint HTTP em minutos.

Defina um módulo e um handler usando a API PL/SQL do `ORDS`:

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

Após executar esse bloco, `POST /ords/{schema}/kb/search` aceita um body JSON com `query_vector` (um array JSON de floats serializado como string) e `top_k` (inteiro), e retorna uma coleção JSON de chunks correspondentes. A sintaxe de variável bind — `:query_vector`, `:top_k` — é o binding padrão de parâmetros do ORDS. Sem concatenação de strings, sem superfície para SQL injection.

O cliente LLM chama esse endpoint, recebe os chunks recuperados como JSON, os monta como contexto e passa esse contexto ao modelo junto com a pergunta do usuário. O banco cuida do armazenamento, indexação e recuperação. O modelo cuida da linguagem. Nenhum dos dois invade o domínio do outro.

## Filtrando antes da etapa vetorial

A busca vetorial pura retorna as linhas semanticamente mais similares, mas RAG em produção frequentemente precisa de um pré-filtro: retornar apenas chunks de documentos publicados após uma determinada data, pertencentes a um projeto específico, ou visíveis ao usuário atual. O Oracle 23ai suporta combinar um predicado `WHERE` padrão com `VECTOR_DISTANCE`:

```sql
SELECT chunk_text, source_doc,
       VECTOR_DISTANCE(embedding, :query_vector, COSINE) AS score
FROM   kb_chunks
WHERE  source_doc LIKE :doc_prefix || '%'
ORDER  BY score
FETCH  FIRST :top_k ROWS ONLY;
```

O otimizador pode aplicar o filtro antes do scan vetorial quando a seletividade é alta, o que significa que você está fazendo a busca de vizinho mais próximo aproximado sobre um conjunto menor. Essa é uma das vantagens estruturais de manter vetores dentro de um motor relacional: você pode combinar predicados vetoriais com predicados SQL arbitrários em um único plano de consulta, em vez de coordenar entre um banco de vetores e um banco relacional na camada da aplicação.

## O que o Veesker adiciona a esse fluxo

Se você abrir uma conexão 23ai no Veesker, o navegador de schema reconhece colunas `VECTOR` e exibe sua dimensão e formato declarados. O contexto de IA para aquela conexão inclui a versão do servidor detectada, então quando você pede ao AI para criar uma consulta de busca por similaridade, ele produz `VECTOR_DISTANCE` e `FETCH FIRST` — e não sintaxe adequada para outro banco ou uma versão mais antiga do Oracle.

O DDL do handler ORDS acima é exatamente o tipo de bloco que a camada de IA pode gerar contra o seu schema real — ela lê o nome da tabela, a dimensão da coluna vetorial e a métrica de distância declarada a partir da conexão ativa, não de um template genérico. O Veesker é local-first por design: a inspeção de schema roda dentro da sua rede, e o IDE nunca se comunica com servidores externos.

A camada Cloud (chegando no segundo semestre de 2026) adiciona um ciclo de feedback entre a saída do `EXPLAIN PLAN` e o AI. Para consultas vetoriais, isso é relevante: se o índice HNSW não está sendo utilizado, o plano mostra um full scan, e o AI pode sugerir o motivo — métrica de distância diferente entre o índice e a consulta, cast ausente, predicado `WHERE` que impede o uso do índice — antes de você chegar em produção.

## Fechamento

O suporte a vetores do Oracle 23ai não é um wrapper em torno de um banco de vetores externo. O tipo `VECTOR`, o `VECTOR_DISTANCE` e os tipos de índice HNSW e IVF são nativos do mesmo motor que já guarda os dados da sua aplicação. Para times que já rodam Oracle e já rodam ORDS, o caminho do zero a um endpoint RAG funcional é sensivelmente mais curto do que a arquitetura de múltiplos serviços que a maioria dos tutoriais descreve.

Se você quiser explorar o tipo `VECTOR` e o `VECTOR_DISTANCE` em uma conexão 23ai ao vivo, [baixe o Veesker](/download) — navegação de schema, contextualização de IA e scaffolding de handlers ORDS estão todos na Community Edition, Apache 2.0, gratuita.

— *Veesker*
