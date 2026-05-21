---
title: "Por que \"IA para SQL\" é quase sempre um problema de UX, não de modelo"
description: "O LLM consegue escrever SQL Oracle correto — ele só precisa do schema, da versão e do plano de execução. Fornecer esses três elementos é uma responsabilidade de UX, não do modelo."
date: "2026-05-21"
slug: "ia-para-sql-e-um-problema-de-ux"
lang: "pt"
kind: "manifesto"
tags: ["oracle", "ia", "ferramentas-de-desenvolvimento", "ux"]
translation_slug: "ai-for-sql-is-a-ux-problem"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

A narrativa principal sobre IA e SQL está errada há dois anos. O debate gira em torno de se o modelo é bom o suficiente. O verdadeiro gargalo é se a ferramenta está fazendo o seu trabalho.

A maioria dos produtos de "IA para SQL" segue o mesmo padrão: colar um schema em um system prompt, embrulhar uma interface de chat em torno de um LLM de ponta e lançar o produto. O modelo é estado da arte. A UX é uma caixa com um cursor piscando. E quando o modelo alucina `LIMIT 10` em vez de `FETCH FIRST 10 ROWS ONLY`, ou sugere um `MERGE` que só analisa no Oracle 23ai, ou remove suas hints cuidadosamente posicionadas porque decidiu que eram ruído — a equipe de produto culpa o modelo.

O modelo não é o problema.

O modelo nunca viu sua versão do Oracle. Ele não sabe se você está no 11g com um conjunto restrito de pacotes internos ou no 23ai com colunas de vetor no escopo. Ele não consegue ler a saída do seu `EXPLAIN PLAN`. Não tem nenhum sinal sobre se uma reescrita proposta melhorou as coisas ou as piorou. Você forneceu um prompt, ele forneceu uma suposição, e todos ficam surpresos quando a suposição está errada.

Isso é um problema de contexto. Contexto é responsabilidade da UX.

A solução não é um modelo maior. A solução é conectar a ferramenta de forma que o modelo saiba três coisas antes de escrever um único token: o schema das tabelas em escopo, a versão do Oracle do banco de dados conectado e — se você está pedindo uma reescrita — o plano de execução do que você está partindo. Dê ao modelo esses três insumos e a taxa de erros cai a uma fração do que uma interface de chat pura produz. Não forneça nenhum deles e até um modelo de ponta vai gerar SQL que falha numa verificação de parse antes de chegar ao otimizador.

A camada de IA da Veesker é construída exatamente em torno disso. O contexto de schema é extraído da conexão ativa e incluído automaticamente. A versão do servidor é lida do pacote de conexão e injetada em cada requisição, para que o modelo nunca sugira sintaxe que não existe no seu Oracle. A camada Cloud (chegando no H2 2026) fecha o ciclo com feedback do plano de execução — uma reescrita é medida pelo veredicto do otimizador antes de ser oferecida como sugestão.

Isso não é um avanço de modelo. É uma decisão de UX tomada antes de o modelo ser invocado.

O debate no setor deveria mudar. Pare de perguntar em qual modelo confiar para SQL Oracle. Comece a perguntar se sua ferramenta está fazendo o trabalho de contextualizar o modelo antes de ele responder. Um modelo menor bem contextualizado supera um modelo de ponta sem contexto em SQL específico de domínio. Não porque o modelo menor sabe mais — mas porque ele recebeu algo concreto com que trabalhar.

A Veesker é local-first por design; o aplicativo desktop lê seu schema diretamente sem enviar dados para a nuvem. A Community Edition é gratuita sob a licença Apache 2.0. Se você quer ver como parece a assistência de IA contextualizada para Oracle na prática, [baixe o Veesker](/download) e aponte para o seu schema no 11g, 19c ou 23ai.

O modelo não muda. O contexto sim.

— *Veesker*
