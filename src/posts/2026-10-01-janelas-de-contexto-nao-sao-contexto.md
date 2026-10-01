---
title: "Janelas de contexto não são o mesmo que contexto"
description: "Uma janela de 200k tokens não diz nada à IA sobre o seu banco 11g. Contexto precisa ser conquistado, não apenas medido em tokens."
date: "2026-10-01"
slug: "janelas-de-contexto-nao-sao-contexto"
lang: "pt"
kind: "manifesto"
tags: ["ai", "oracle", "developer-tools", "trust"]
translation_slug: "context-windows-are-not-context"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

Toda ferramenta de IA voltada para banco de dados apresenta o mesmo número: o tamanho da janela de contexto. 200k tokens. 1M tokens. "Toda a sua base de código cabe no contexto."

O tamanho da janela é real. A afirmação de que isso resolve o seu problema não é.

Uma janela de contexto é um recipiente. Contexto é o que vai dentro dele. Todo desenvolvedor Oracle que já viu um LLM de grande contexto produzir com confiança `LIMIT 10` em uma query do 19c, ou sugerir uma cláusula `WITH` que não compila no 11g, já conhece essa diferença.

O que uma janela de 200k tokens oferece é a capacidade de colar mais código-fonte. O que ela não oferece automaticamente:

- Conhecimento de qual versão do Oracle está rodando na conexão
- Entendimento de quais pacotes nativos estão disponíveis nessa versão
- Consciência dos índices, constraints e estatísticas que regem o plano de execução
- A semântica específica de `MERGE`, `CONNECT BY` e os built-ins do PL/SQL que mudaram entre os releases do Oracle

Nada disso viaja em uma janela de contexto a menos que algo deliberadamente coloque lá. O modelo não lê a saída do seu `v$version` antes de responder. Ele não verifica se `JSON_OBJECT` existia no 12c. Ele não sabe que o `DBMS_STATS` exige parâmetros diferentes no 11g e no 19c.

Este é o gap de confiança que realmente importa. Não se o modelo é inteligente o suficiente para escrever SQL — ele é. O gap está em se a ferramenta fez o trabalho de dar ao modelo o que ele realmente precisa para responder corretamente.

Grounding não é uma funcionalidade. É a pré-condição para ferramentas de IA para banco de dados nas quais você pode confiar em produção.

O Veesker lê a versão do servidor conectado no login e a carrega em cada prompt. Lê o seu schema localmente — sem upload, sem dependência de cloud, sem vazar nomes de tabelas para uma API de terceiros — e inclui a estrutura ativa dos objetos que você está consultando. Quando você pede uma reescrita em uma conexão 11g, o modelo sabe que é 11g. Quando você pergunta sobre busca vetorial no 23ai, o modelo sabe quais funções realmente existem.

A janela de contexto é apenas o orçamento. O que importa é se a ferramenta gastou esse orçamento em informações verdadeiras.

Confiança em ferramentas de IA não é uma decisão única. É construída uma query de cada vez — toda vez que a sugestão chega correta, toda vez que ela não alucina uma função que não existe na sua versão, toda vez que ela respeita o hint de índice que você escreveu porque tinha um motivo para isso.

Uma janela de contexto grande é fácil de implementar. Contexto conquistado é o trabalho de verdade.

**Baixe o Veesker** e conecte ao seu ambiente Oracle com IA que sabe exatamente qual versão está trabalhando: [veesker.cloud/download](/download).

— *Veesker*
