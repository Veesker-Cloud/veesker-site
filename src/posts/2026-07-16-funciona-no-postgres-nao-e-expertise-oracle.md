---
title: '"Funciona no Postgres" Não É Expertise em Oracle'
description: "Suportar Oracle não é o mesmo que entender Oracle. O caso por ferramentas construídas dialeto-primeiro, não multi-dialeto."
date: "2026-07-16"
slug: "funciona-no-postgres-nao-e-expertise-oracle"
lang: "pt"
kind: "manifesto"
tags: ["oracle", "developer-tools", "ai", "sql"]
translation_slug: "works-on-postgres-is-not-oracle-expertise"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

Existe uma categoria de ferramenta para desenvolvedores que lista Oracle como um dos vinte e dois bancos de dados suportados. A seção Oracle da documentação tem sua própria página. O diálogo de conexão tem uma aba Oracle. No texto de marketing, Oracle aparece ao lado de MySQL, Postgres, SQL Server e alguns outros. A ferramenta "suporta" Oracle da mesma forma que um dicionário francês suporta o finlandês: consegue soletrar as palavras, mas não faz ideia do que você quer dizer.

Isso importa mais do que parece.

Oracle não é Postgres com um protocolo de rede diferente. É um dialeto distinto que vem acumulando comportamento por três décadas. `CONNECT BY PRIOR` não é um join incomum — é a sintaxe canônica de consulta recursiva para uma geração de relatórios Oracle, e se comporta de forma diferente de uma CTE recursiva no otimizador baseado em custo do Oracle. `ROWNUM` antecede as window functions e se comporta de maneiras que consistentemente surpreendem desenvolvedores que conhecem `LIMIT`. `MERGE` existe no Oracle 9i, antecede o padrão SQL, e tem uma sintaxe ligeiramente diferente que vai quebrar silenciosamente se você copiar de um exemplo Postgres. Hints — `/*+ INDEX(t t_pk) */`, `/*+ PARALLEL(t 4) */` — não são ruído depreciado. São o vocabulário que DBAs Oracle usam para se comunicar com o otimizador baseado em custo quando ele toma a decisão errada, o que acontece.

Uma ferramenta genérica ignora tudo isso ou erra. O formatador SQL remove seus hints. A IA sugere `LIMIT` em vez de `FETCH FIRST N ROWS ONLY`. O navegador de esquema mostra uma lista plana de tabelas em vez da hierarquia CDB/PDB que é o formato padrão do Oracle desde o 12c. O autocompletar não sabe o que `DBMS_STATS.GATHER_TABLE_STATS` espera porque está lendo documentação SQL genérica, não as assinaturas de pacotes versionadas da Oracle.

Nada disso é malícia. É arquitetura. Quando você constrói para vinte e dois bancos de dados, Oracle recebe um vinte e dois avos da sua atenção. Essa é a matemática.

Os usuários que pagam por essa troca são os desenvolvedores Oracle que passam uma tarde inteira caçando um bug que acaba sendo o formatador da IDE substituindo um hint correto por nada. Ou o novo membro da equipe que se queima com a semântica do `ROWNUM` porque a ferramenta não alertou. Ou o DBA que não pode confiar na sugestão de reescrita da IA porque pode ser pensamento Postgres em roupas Oracle.

Ferramentas específicas para dialeto não são um nicho de especialistas. É o mínimo aceitável para uma ferramenta que se chama de IDE Oracle. Conhecer a sintaxe é o básico. Conhecer o otimizador, as assinaturas de pacotes, o comportamento por versão, o handshake de wallet, a realidade de estates mistos — isso é expertise em Oracle, e não está disponível em um menu suspenso.

O Veesker é construído Oracle-primeiro — não porque Oracle é o único banco de dados que vale a pena, mas porque é o que vale a pena fazer corretamente. A Community Edition é gratuita, Apache 2.0, e disponível para Windows, macOS e Linux. Sem telemetria, sem phone-home, sem o compromisso de vinte e dois bancos de dados.

[Baixe o Veesker](/download)

— *Veesker*
