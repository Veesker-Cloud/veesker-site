---
title: "\"Funciona no Postgres\" não é expertise Oracle"
description: "Ferramentas SQL genéricas que anunciam suporte Oracle geralmente significam conexão, não compreensão — e a diferença aparece toda vez que você escreve PL/SQL."
date: "2026-07-09"
slug: "funciona-no-postgres-nao-e-expertise-oracle"
lang: "pt"
kind: "manifesto"
tags: ["oracle", "developer-tools", "plsql", "ai"]
translation_slug: "works-on-postgres-is-not-oracle-expertise"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

A página de suporte Oracle na maioria das ferramentas de banco de dados significa uma coisa: a ferramenta consegue abrir uma conexão. Encontrou um driver JDBC. Renderizou uma lista de tabelas. Isso não é expertise Oracle. Isso é conectividade Oracle.

A distinção importa porque Oracle não é uma variante de sintaxe do Postgres ou MySQL. É uma linhagem de engenharia separada — que vem acumulando suas próprias decisões desde antes da maioria de seus usuários atuais nascer. CONNECT BY, não CTEs recursivas. MERGE com uma cláusula ON que segue regras de parsing diferentes das do SQL Server. Semântica do ROWNUM que quebra imediatamente se você envolver no subquery errado. Exception handlers em blocos anônimos. Estado de package que persiste entre chamadas na mesma sessão. Transações autônomas. Queries hierárquicas. Herança de tipos em schemas objeto-relacional. Mais de vinte anos de sintaxe de hints que o otimizador ainda lê.

Uma ferramenta genérica não sabe nada disso. Ela renderiza linhas. Executa EXPLAIN PLAN se você tiver sorte. Quando você pede ajuda para escrever um procedimento PL/SQL, ela escreve algo que parece plausível e quebra na compilação. Quando a IA sugere uma reescrita de query, ela silenciosamente emite `LIMIT 10` em vez de `FETCH FIRST 10 ROWS ONLY`, e torce para que você não esteja prestando atenção.

O mesmo problema atinge a IA com mais força. Um LLM treinado na web aberta viu muito mais queries Postgres do que Oracle, muito mais respostas do Stack Overflow sobre MySQL do que packages PL/SQL. Quando você pede ajuda com um problema Oracle, ele frequentemente vai responder a versão Postgres daquele problema, com semelhança superficial suficiente para enganar você a colar a resposta.

Expertise de dialeto não é uma posição de marketing. É um conjunto de decisões tomadas em cada camada do produto: o parser que sabe que `CONNECT BY NOCYCLE PRIOR` é sintaxe Oracle válida; o contexto de IA que inclui a versão do servidor conectado antes de cada prompt; a UI que mostra estrutura CDB e PDB no 12c e a oculta no 11g; o autocomplete que não sugere funções JSON que não existiam até o 21c.

Você pode construir uma ferramenta que funciona no Oracle, Postgres, MySQL, SQL Server e mais doze outros. A questão é o que "funciona" significa. Se significa abrir uma conexão, várias ferramentas passam nessa barra. Se significa que a ferramenta realmente entende o que você está escrevendo quando escreve Oracle — que as sugestões são corretas, o parser está certo, a IA está fundamentada — então especialização de dialeto não é opcional. É o produto.

O Veesker é Oracle-first por design. A Community Edition é gratuita sob Apache 2.0, disponível para Windows, macOS e Linux, e conecta a todas as versões Oracle de 9i até 26ai sem instalação de cliente separado. Baixe em [veesker.cloud/download](/download), ou [entre na lista de espera do Cloud](/#waitlist) — IA gerenciada, auto-tune e fluxos de trabalho em equipe chegando no H2 2026, com preço de fundador bloqueado em US$ 29 por assento por mês para membros da lista.

— *Veesker*
