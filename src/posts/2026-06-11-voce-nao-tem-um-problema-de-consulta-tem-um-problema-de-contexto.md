---
title: "Você não tem um problema de consulta, tem um problema de contexto"
description: "Quando a assistência de IA para SQL falha, o modelo raramente erra sobre SQL — ele erra sobre o seu banco de dados. A solução é contexto, não um modelo maior."
date: "2026-06-11"
slug: "voce-nao-tem-um-problema-de-consulta-tem-um-problema-de-contexto"
lang: "pt"
kind: "manifesto"
tags: ["oracle", "ai", "sql", "developer-tools", "contexto"]
translation_slug: "you-dont-have-a-query-problem-you-have-a-context-problem"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

Quando a assistência de IA para SQL falha, os desenvolvedores recorrem à mesma explicação: o modelo não conhece Oracle suficientemente bem. Esse quase nunca é o diagnóstico real. O modelo geralmente conhece Oracle. Ele não conhece *o seu* Oracle.

Considere o que um LLM genérico enxerga quando você cola uma consulta e pede para corrigir a performance:

- Uma string de consulta, despida dos nomes de colunas que têm significado para a sua equipe
- Sem esquema: ele não sabe se `TRX_HEADER` tem 300 linhas ou 300 milhões
- Sem informação de índices: ele não pode saber que `IDX_TRX_STATUS_DT` existe e cobre exatamente as colunas que está cogitando remover do WHERE
- Sem versão: ele vai escrever `FETCH FIRST 10 ROWS ONLY` mesmo que seu banco seja 11g
- Sem plano de execução: ele não pode saber se o otimizador escolheu nested loop ou hash join — e essa escolha costuma ser o problema real

O modelo preenche essas lacunas com os dados do seu corpus de treinamento: respostas do Stack Overflow, páginas da documentação Oracle, posts de blog escritos para 19c e 23ai em bancos limpos. Sua instalação 11g com 400 tabelas particionadas e um job de coleta de estatísticas que rodou pela última vez em 2021 não está nesses dados de treinamento.

O resultado é uma sugestão que é *SQL tecnicamente correto* e *contextualmente errado para a sua situação*. Parece uma falha do modelo. É uma falha de contexto.

**A solução não é um modelo mais inteligente. A solução é ancoragem.**

Ancoragem significa que a ferramenta lê o seu esquema antes que a IA escreva uma palavra. Significa que a ferramenta conhece a versão Oracle que a conexão reportou, não a versão que a IA supõe que você está usando. Significa que quando você pede para otimizar uma consulta, a ferramenta anexa a saída real do `EXPLAIN PLAN` e deixa o modelo raciocinar a partir de um plano de execução real — não de um imaginado.

Essa é a diferença entre um assistente de IA de propósito geral que leu a documentação Oracle e uma IDE Oracle que executa IA dentro de um envelope de dados reais de conexão. O primeiro te dá SQL fluente e plausível. O segundo te dá SQL que provavelmente vai funcionar no banco de dados específico que você está diante.

A camada de IA do Veesker é construída sobre essa premissa. Ela lê o seu esquema no momento da conexão, anexa a versão Oracle e — através da camada Cloud (chegando no segundo semestre de 2026) — fecha o ciclo alimentando a saída do `EXPLAIN PLAN` de volta ao modelo após cada sugestão de reescrita. A IA vê o veredicto do otimizador baseado em custo, não apenas a sua própria saída.

A Community Edition é local-first, Apache 2.0 e funciona totalmente offline — o seu esquema nunca sai da sua máquina. Se você quiser o ciclo de IA gerenciado, é para isso que serve a camada Cloud: $29 USD por assento por mês, preço founder fixado para os membros da lista de espera, disponibilidade geral no segundo semestre de 2026.

Pare de culpar o modelo. Dê a ele o contexto que precisa. [Baixe o Veesker](/download) e veja como é a assistência de IA para SQL quando ela realmente sabe onde está.

— *Veesker*
