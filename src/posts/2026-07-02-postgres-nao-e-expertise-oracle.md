---
title: "Por Que 'Funciona no Postgres' Não É Expertise em Oracle"
description: "Uma ferramenta que suporta Oracle como mais um entre cinquenta dialetos não entende Oracle — ferramentas específicas para dialeto são uma fundação, não um diferencial."
date: "2026-07-02"
slug: "postgres-nao-e-expertise-oracle"
lang: "pt"
kind: "manifesto"
tags: ["oracle", "developer-tools", "sql-dialects", "ai", "tooling"]
translation_slug: "postgres-is-not-oracle-expertise"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

Há uma categoria de ferramenta de banco de dados que se descreve como suportando "60+ bancos de dados, incluindo Oracle." Oracle está na lista. O assistente de conexão tem um dropdown. O navegador de esquema vai mostrar suas tabelas.

Isso não é expertise em Oracle.

Expertise em Oracle significa saber que `FETCH FIRST 10 ROWS ONLY` chegou no 12c e que a instância 11g de produção no data center do seu cliente ainda precisa de `ROWNUM`. Significa saber que `CONNECT BY PRIOR` não é uma peculiaridade legada a ser reescrita como CTE recursivo — muitas vezes é a escolha certa, e o otimizador baseado em custo sabe como executá-lo. Significa saber que quando a IA sugere remover suas hints, ela está errada, e conseguir explicar por quê.

Uma ferramenta genérica não aprende nada disso. Ela tem um driver, um console SQL, e talvez um navegador de esquema que tropeça nas views `ALL_` do Oracle. O desenvolvedor que a usa ainda carrega todo o conhecimento de Oracle na cabeça — a ferramenta apenas fornece uma janela para digitar.

A lacuna aparece em todo lugar. Você cola uma query em um assistente de IA genérico e ele gera sintaxe `LIMIT`, ou reescreve seu `MERGE` com lógica que não analisa no 11g, ou remove com confiança a hint `/*+ INDEX(t idx_created) */` porque parece um comentário para um modelo que viu principalmente Postgres. A ferramenta não te avisou. Ela não sabia o suficiente para avisar.

Isso não é uma crítica às pessoas que constroem ferramentas de propósito geral. Cobrir 60 dialetos é difícil, e é um produto legítimo. Mas é um produto diferente de uma ferramenta nativa Oracle, e a diferença não está em cobertura — está em profundidade. Uma ferramenta construída sobre conhecimento específico de Oracle pode restringir funcionalidades por versão do servidor. Pode dizer à IA exatamente o que a instância conectada compreende. Pode se recusar a sugerir sintaxe que o servidor de destino não consegue executar.

O padrão para "suporte Oracle" ficou baixo demais por tempo demais. Uma conexão que não trava não é expertise. Um navegador de esquema que lista tabelas não é expertise. Expertise é saber que `DBMS_STATS.GATHER_TABLE_STATS` tem uma assinatura de parâmetros diferente no 11g e no 19c, e mostrar a correta quando o desenvolvedor passa o cursor sobre ela.

O Veesker foi construído desde o início com Oracle como único alvo. Essa restrição é o produto. A Community Edition é Apache 2.0 e [gratuita para download](/download). Se você quer a camada de IA gerenciada que mantém esse conhecimento de dialeto atualizado enquanto você consulta, [entre na lista de espera do Cloud](/#waitlist) — GA no segundo semestre de 2026, USD 29/assento/mês, preço de fundador garantido para os primeiros membros.

— *Veesker*
