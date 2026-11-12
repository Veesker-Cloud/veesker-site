---
title: "Janelas de contexto não são contexto"
description: "Uma janela de contexto grande não significa que a IA entende o seu banco de dados. A confiança em SQL gerado por IA precisa ser conquistada consulta por consulta."
date: "2026-11-12"
slug: "janelas-de-contexto-nao-sao-contexto"
lang: "pt"
kind: "manifesto"
tags: ["ai", "oracle", "ferramentas-para-desenvolvedores", "grounding"]
translation_slug: "context-windows-are-not-context"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

A corrida de marketing por "contexto" em ferramentas de IA virou uma competição de ficha técnica: X milhões de tokens, Y milhões de tokens, mais janela de contexto que o concorrente. Esse número mede quanto texto um modelo consegue manter em memória de trabalho. Não mede se o modelo entende o seu banco de dados.

São duas coisas diferentes. Confundi-las explica por que uma boa parte do SQL gerado por IA está discretamente errado.

## Colar o esquema não é grounding

A demo popular funciona assim: cole o DDL do seu esquema no prompt, peça para a IA escrever uma consulta. Se o esquema cabe na janela de contexto, o modelo consegue referenciar nomes de colunas corretamente. Se o esquema for maior do que a janela, o modelo começa a inventar nomes de tabelas que nunca existiram.

A solução proposta — por todos os fornecedores que estão vencendo a corrida da janela de contexto — é uma janela maior. Encaixar mais DDL. Com o tempo, o esquema inteiro. Problema resolvido.

Só que não está. Colar DDL não é o mesmo que entender um banco de dados. Isso diz ao modelo quais colunas existem. Não diz o que uma coluna `STATUS` do tipo `VARCHAR2(2)` realmente significa na sua aplicação, quais valores estão populados, se o índice em `CREATED_DATE` é alguma vez utilizado, ou por que a tabela `INVOICE_LINES` tem 400 milhões de linhas e não pode sofrer uma varredura completa em hipótese alguma.

Esse conhecimento não está no DDL. Ele vive nas estatísticas, na saída do `EXPLAIN PLAN`, no histórico de consultas que mostra o que o otimizador foi realmente solicitado a fazer, e na tradição oral de quem escreveu o esquema há seis anos. Uma janela de contexto maior não contém nada disso a não ser que você coloque deliberadamente — e ninguém faz isso num fluxo de colar-e-perguntar.

## Confiança é conquistada por consulta, não por contagem de tokens

Uma ferramenta de IA que de fato leu as suas estatísticas, detectou a sua versão do Oracle, observou as definições de índice e viu as últimas três saídas do `EXPLAIN PLAN` para a tabela que você está consultando — essa ferramenta conquistou um pouco de confiança. Não uma confiança irrestrita. Não "execute sem revisar". Apenas confiança suficiente para levar a sugestão a sério como ponto de partida, em vez de tratá-la como uma alucinação a ser verificada linha por linha.

Esse é o abismo entre janela de contexto e contexto real. Um é uma capacidade do modelo. O outro é o resultado de um trabalho feito antes de a consulta ser escrita — o grounding que torna uma sugestão significativa em vez de apenas plausível.

A camada de IA do Veesker lê o seu esquema ao vivo antes de gerar SQL. Ela sabe qual versão do Oracle a conexão reportou. A camada Cloud (chegando no segundo semestre de 2026) devolve a saída do `EXPLAIN PLAN` para o modelo, de modo que as sugestões de reescrita estejam ancoradas no veredito do otimizador baseado em custo — não no que o modelo supõe que uma "consulta rápida" parece em abstrato.

Isso não é uma janela maior. Isso é contexto de verdade. A diferença aparece em cada consulta que não explode uma varredura de tabela em produção.

**[Baixe o Veesker](/download)** e conecte uma IA que começa pelo seu esquema em vez de adivinhar. Ou **[entre na fila de espera do Cloud](/#waitlist)** para a camada completa de IA fundamentada quando for lançada no segundo semestre de 2026.

— *Veesker*
