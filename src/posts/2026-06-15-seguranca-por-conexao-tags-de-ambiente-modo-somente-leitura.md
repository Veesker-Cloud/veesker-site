---
title: "Segurança por conexão no Veesker: tags de ambiente, modo somente leitura, timeouts e guardas de DML"
description: "Como os controles de segurança por conexão do Veesker — tags de ambiente, modo somente leitura, timeouts e guardas de DML — tornam a conexão errada perceptível antes da execução."
date: "2026-06-15"
slug: "seguranca-por-conexao-tags-de-ambiente-modo-somente-leitura"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "segurança", "ferramentas-desenvolvimento", "dml", "gerenciamento-conexoes"]
translation_slug: "per-connection-safety-env-tags-read-only-statement-timeouts"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Quando você tem oito conexões de banco de dados abertas — duas de produção, uma de homologação, quatro instâncias de desenvolvimento e um sandbox — o momento mais perigoso não é aquele em que você escreve uma query errada. É quando você executa uma query perfeitamente válida na conexão errada.

Um `DELETE FROM orders WHERE status = 'PENDING'` é totalmente razoável no banco de dados local de desenvolvimento. No sistema de produção real, vira um incidente.

A resposta padrão da maioria das ferramentas é "tenha cuidado." A resposta do Veesker é um conjunto de controles de segurança por conexão que tornam o descuido estruturalmente mais difícil.

## Tags de ambiente

Toda conexão no Veesker carrega uma tag de ambiente: `DEV`, `TEST`, `STAGING` ou `PROD`. A tag é definida ao criar o perfil de conexão e se propaga visualmente por toda a interface.

- As abas de conexão exibem um badge colorido: verde para dev, amarelo para test, laranja para staging, vermelho para produção.
- O editor de queries muda o visual para refletir o ambiente: uma borda fina na cor do ambiente emoldura o editor na conexão ativa.
- Copiar uma string de conexão para um novo perfil preserva a tag — ela não herda acidentalmente o ambiente de origem.

A distinção visual não é decoração. Quando você alterna rapidamente entre abas e uma borda vermelha aparece na visão periférica, o custo cognitivo de "espera, em qual conexão estou?" cai sensivelmente. Você constrói o hábito na primeira vez que vê uma conexão de produção ficar vermelha; depois disso, a cor faz a lembrança por você.

Você pode renomear os rótulos de ambiente e alterar a paleta de cores nas configurações. Os padrões seguem convenção, não regulamentação — se o seu ambiente usa "live" em vez de "prod", é uma edição de três segundos.

## Modo somente leitura

Cada perfil de conexão tem uma opção de somente leitura. Quando ativada, o Veesker verifica cada instrução antes de ela chegar ao driver do banco.

A mecânica é direta: o Veesker analisa a instrução para identificar o tipo antes de executar. Se for `SELECT`, `EXPLAIN PLAN` ou uma expressão `WITH ... SELECT`, passa normalmente. Se for `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`, `GRANT`, `REVOKE` ou `CALL`, o Veesker a intercepta e exibe um modal de confirmação:

> Esta conexão está configurada como somente leitura. Tipo de instrução: DELETE. Executar mesmo assim?

Dois botões: **Cancelar** e **Executar (ignorar somente leitura para esta instrução)**. Não existe atalho de "desativar somente leitura globalmente" nesse modal por design — a substituição é sempre por instrução, sempre deliberada.

O modo somente leitura não define a sessão Oracle como `ALTER SESSION SET CONSTRAINTS = READ ONLY` nem impõe a restrição no nível do banco. A proteção é na camada de aplicação. Isso significa que funciona em qualquer versão Oracle sem exigir privilégios de DBA no banco-alvo — e significa que um acesso JDBC por outra ferramenta ainda chegaria ao banco sem essa guarda. O modo somente leitura no Veesker é uma rede de segurança de UX, não um limite de segurança. Se precisar de proteção de leitura no nível do banco, use um usuário Oracle somente leitura ou um standby com Active Data Guard.

## Timeouts de instrução

Queries de longa duração são a causa mais comum de eventos de carga inesperados em produção que começam na janela de queries de um desenvolvedor. O cenário é familiar: um desenvolvedor abre uma conexão de produção para investigar um relatório lento, reescreve a query para testar uma ordem de join diferente e, sem querer, coloca o caminho lento antigo em um servidor sem limites de resource manager ativos.

O Veesker permite definir um timeout de instrução por conexão, em segundos. Quando uma instrução ultrapassa o tempo, o Veesker a cancela — chamando `OCI_BREAK` na chamada ativa, que envia uma solicitação de interrupção imediata ao servidor Oracle. A query é cancelada no nível do servidor, não apenas abandonada no cliente.

O padrão é sem limite. O perfil de conexão aceita um valor inteiro em segundos. Um ponto de partida razoável para conexões de produção é 30 segundos; para cargas analíticas ou queries de lote, pode ser necessário um valor maior ou desativar o timeout em um perfil de conexão dedicado.

O timeout se aplica à fase de execução. Não se aplica à fase de busca de resultados — se uma query retorna com sucesso em 5 segundos mas você então começa a buscar 10 milhões de linhas lentamente, o timeout não dispara. Essa distinção é importante para grandes conjuntos de resultados em redes lentas.

Uma nota prática: chamadas `DBMS_SCHEDULER` e blocos PL/SQL de longa duração que fazem iterações internas em uma única instrução também estão sujeitos ao timeout. Se você tiver procedimentos legítimos de longa duração, crie um perfil de conexão separado sem timeout para operações em lote e mantenha o restrito para uso interativo.

## Guardas de DML inseguro

Além do modo somente leitura, o Veesker tem uma camada separada de guardas para instruções que são tecnicamente DML válido mas carregam risco acima da média de perda irreversível de dados:

- `DELETE` sem cláusula `WHERE`
- `TRUNCATE TABLE`
- `DROP TABLE`, `DROP INDEX`, `DROP SEQUENCE`, `DROP PACKAGE`, `DROP TYPE`
- `ALTER TABLE ... DROP COLUMN`
- `UPDATE` sem cláusula `WHERE` em uma tabela com mais de um limite configurável de linhas (padrão: 10.000 linhas — verificado via `NUM_ROWS` em `ALL_TABLES`, que reflete a última coleta de estatísticas)

Para cada um desses casos, o Veesker apresenta uma etapa de confirmação que nomeia o objeto afetado e o escopo estimado:

> DML inseguro detectado: DELETE FROM orders (sem cláusula WHERE). A tabela tem aproximadamente 1.847.233 linhas segundo a última coleta de estatísticas. Executar?

A estimativa de linhas vem de `ALL_TABLES.NUM_ROWS` por uma consulta de metadados executada no momento da análise. Pode estar desatualizada se as estatísticas estiverem obsoletas e será 0 em tabelas sem estatísticas coletadas. A guarda exibe o que o Oracle tem nessa coluna — não bloqueia a execução por um valor zero, pois bloquear cada operação sem guarda em uma tabela nova geraria mais atrito do que segurança.

Você pode suprimir um tipo de guarda específico permanentemente nas configurações, ou desativar todas as guardas em uma conexão específica. Também é possível adicionar padrões personalizados — se o seu ambiente tem uma convenção de nomenclatura para tabelas de log ou de staging que são seguras para truncar, você pode adicionar uma expressão regular à lista de permissões das guardas e remover a confirmação para os nomes que correspondam.

## Como a camada de IA respeita esses controles

Esses controles de segurança interagem diretamente com a camada de IA do Veesker. Quando você pede à IA para gerar uma query em uma conexão com a tag `PROD` e marcada como somente leitura, o contexto enviado ao modelo inclui esses atributos. A IA irá:

- Preferir padrões `SELECT` a padrões de escrita quando a intenção for ambígua
- Sinalizar na resposta se a query sugerida for uma operação de escrita em uma conexão somente leitura, em vez de gerá-la silenciosamente
- Evitar gerar instruções `TRUNCATE` ou `DELETE` sem guarda quando a tag da conexão for `PROD` ou `STAGING`

Isso não é um bloqueio rígido — a IA ainda gerará queries de escrita quando você pedir explicitamente. Os metadados de segurança moldam os padrões do modelo, não suas restrições rígidas. As restrições rígidas ficam nas guardas descritas acima.

A camada Cloud (em breve, prevista para H2 2026) estende isso: conexões gerenciadas poderão carregar políticas de segurança no nível da equipe definidas por um DBA ou líder técnico, e essas políticas viajam com o perfil de conexão compartilhado em vez de exigir que cada desenvolvedor as configure individualmente.

## Padrões que protegem sem exigir uma lista de verificação

A filosofia por trás dessas funcionalidades é que controles de segurança devem funcionar fora da caixa. As tags de ambiente são visualmente imediatas na primeira vez que você as atribui. O modo somente leitura é uma única opção no perfil de conexão. Os timeouts têm um padrão sem limite que você pode restringir. As guardas de DML inseguro estão ativadas para todas as conexões, a menos que você as desative.

O objetivo não é fazer do Veesker um fluxo de aprovação para queries. O objetivo é fazer o momento em que você está na conexão errada parecer diferente — visual, mecânica e cognitivamente — do momento em que está na certa. Essa diferença aparece nos três segundos antes de você pressionar executar, exatamente onde precisa estar.

O Veesker é local-first e de código aberto (Apache 2.0). Essas funcionalidades de segurança funcionam inteiramente na sua máquina — sem telemetria, sem comunicação externa, sem serviço gerenciado necessário para ativá-las. A camada Cloud (H2 2026) adiciona gerenciamento de políticas no nível da equipe como uma camada opcional sobre a mesma base.

---

Baixe o Veesker e configure os perfis de segurança das suas conexões: [veesker.cloud/download](/download).

— *Veesker*
