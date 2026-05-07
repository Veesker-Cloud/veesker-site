---
title: "Pare de pedir pro LLM inventar schemas. Ancore o modelo."
description: "Um modelo ancorado escrevendo contra seu schema real ganha do modelo de fronteira chutando. O gargalo da IA em bancos é contexto, não inteligência."
date: "2026-05-07"
slug: "pare-de-pedir-pro-llm-inventar-schemas"
lang: "pt"
kind: "manifesto"
tags: ["ia", "oracle", "schema", "contexto"]
translation_slug: "stop-asking-your-llm-to-invent-schemas"
read_minutes: 3
author: "claude-agent"
hero: "/blog/stop-asking-your-llm-to-invent-schemas.png"
---

Tem um fluxo que virou normal em 2026 e que está quebrado.

Um dev abre o ChatGPT, cola "tenho uma tabela customers e uma tabela orders, me escreve uma query que pega os maiores gastadores do trimestre" e envia pra produção o que cair. O modelo inventa nomes de coluna. O dev corrige na mão. A query roda. Todo mundo chama isso de "SQL com IA".

Não é. É o modelo completando uma resposta de Stack Overflow de 2017 com os nomes das suas colunas pintados por cima.

O mesmo prompt contra o schema *de verdade* — `CUSTOMERS.CUST_ID`, `ORDERS.ORDER_DATE`, a direção da foreign key, o fato de existir uma partição em `ORDER_DATE` e o otimizador querer o predicado escrito de um jeito específico pra usar essa partição — produz uma query diferente. Uma query correta. Muitas vezes 30× mais rápida. A diferença não é o modelo. A diferença é o que o modelo consegue enxergar.

É esse o jogo inteiro. **Ancorado ganha de fronteira.** Um modelo de 70B de parâmetros escrevendo contra um schema real, tipos de dado reais, índices reais e metadados de versão Oracle reais vai entregar mais que um modelo de 400B chutando no escuro. A gente já mediu. Quem já testou os dois honestamente também.

Só que a categoria inteira de IA-pra-banco é construída na premissa oposta. Conecta num SaaS, cola a pergunta, recebe uma resposta plausível. O schema, se aparece, é o que uma sidebar inferiu de um `SHOW TABLES` dois prompts atrás. A versão do Oracle é "Oracle, eu acho". Os hints da sua query são removidos porque o modelo acha que são deprecated. Não são.

É por isso que nossa postura local-first não é nostalgia, nem checkbox de segurança. É a única arquitetura que consegue colocar o schema real dentro do prompt sem antes subir seu banco pra um terceiro. A IDE lê o dicionário de dados. Sabe com qual versão está falando. Vê o particionamento, as constraints, os índices, os comentários de coluna que o DBA escreveu em 2019 e esqueceu. Alimenta *tudo isso* no modelo. O modelo devolve uma query que respeita o conjunto.

A camada Cloud (chegando no H2 2026) estende o loop, não a busca: o output do `EXPLAIN PLAN` volta pro modelo, e a próxima sugestão é medida contra o veredito do otimizador baseado em custo — não contra heurística.

Se você ainda está colando schema na mão dentro de uma caixa de chat, você está fazendo o trabalho do modelo no lugar dele. Para. Pega uma ferramenta que lê seu schema por você, localmente, e alimenta o modelo com o schema inteiro. A query que volta não vai ser plausível. Vai ser correta.

[Baixe o Veesker](/download). Apache 2.0, Windows / macOS / Linux, 9i até 26ai out of the box.

— *Veesker*
