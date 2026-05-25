---
title: "EXPLAIN PLAN como ciclo de feedback para ajuste de consultas com IA"
description: "A maioria das sugestões de IA para consultas é avaliada no vazio. Ancorar a saída da IA no otimizador baseado em custo do Oracle muda a economia do ajuste assistido por IA."
date: "2026-05-25"
slug: "explain-plan-ciclo-de-feedback-ia"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "explain-plan", "ia", "ajuste-de-consultas", "performance"]
translation_slug: "explain-plan-ai-feedback-loop"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Quando você pede a um assistente de IA para reescrever uma consulta Oracle lenta, o modelo avalia sua própria saída no vácuo. Ele tem um modelo mental de SQL Oracle — imperfeito, enviesado pelo que estava super-representado em seu corpus de treinamento — e aplica heurísticas. "Um hash join costuma ser melhor que um nested loop para tabelas grandes." "Adicionar uma hint aqui pode ajudar." "Esta subquery poderia ser reescrita como um lateral join."

Se essas sugestões realmente melhoram o plano de execução no *seu* banco de dados, com a *sua* distribuição de dados e com as *suas* estatísticas, é algo desconhecido até você executar. E a maioria das integrações de IA em ferramentas de desenvolvimento para por aí: o modelo reescreve, você copia e cola, torce para funcionar.

Isso não é um ciclo de feedback. É um chute com etapas extras.

## O que o EXPLAIN PLAN realmente diz

O otimizador baseado em custo (CBO) do Oracle atribui uma estimativa numérica de custo a cada operação em um plano de execução. A estimativa é imprecisa de formas interessantes — ela depende de estatísticas coletadas, estimativas de cardinalidade e premissas que o otimizador incorpora — mas é *consistentemente* imprecisa de formas sobre as quais você pode raciocinar. Quando você compara o EXPLAIN PLAN da consulta original com o da reescrita, está comparando duas avaliações feitas pelo mesmo modelo, com as mesmas estatísticas, contra o mesmo dicionário de dados. O delta é significativo.

Um plano de execução completo carrega mais informação do que apenas o custo:

- **Tipo de operação:** TABLE ACCESS FULL vs INDEX RANGE SCAN vs INDEX FAST FULL SCAN. A escolha não é automaticamente óbvia — às vezes um full scan é mais barato — mas o CBO a fez por um motivo, e esse motivo está no plano.
- **Estimativas de cardinalidade:** A coluna `E-Rows`. Quando a estimativa diz 1 e o valor real é 1.000.000, você tem um problema de estatísticas antes de ter um problema de ajuste. Uma IA sem acesso a essa coluna não vai identificar isso.
- **Informações de predicado:** Quais filtros são aplicados em cada ponto da árvore do plano. Um filtro que deveria ser um predicado de acesso mas aparece como predicado de filtro é um índice não utilizado, e isso fica evidente em `EXPLAIN PLAN FOR ... SELECT ... FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, NULL, 'ALL'))`.
- **Artefatos de bind variable peeking:** Formatos de plano da primeira execução que diferem das execuções subsequentes. A diferença entre EXPLAIN PLAN e V$SQL_PLAN pode sinalizar adaptive cursor sharing em ação, ou sua ausência quando deveria estar presente.

Nada disso é visível para um modelo de IA avaliando sua própria reescrita no vácuo.

## O padrão de ciclo de feedback

O padrão que torna o ajuste assistido por IA viável é simples em princípio e surpreendentemente pouco utilizado na prática:

1. **Capture o plano antes da reescrita.** Execute `EXPLAIN PLAN FOR <consulta_original>` e armazene o resultado.
2. **Forneça todo o contexto à IA.** Consulta, DDL do esquema, versão do servidor e o plano original. Os quatro, não apenas o primeiro.
3. **Capture o plano após a reescrita.** Execute `EXPLAIN PLAN FOR <consulta_reescrita>` na mesma sessão.
4. **Devolva ambos os planos ao modelo.** Pergunte: "A reescrita melhorou o custo estimado? Há regressões nos predicados de acesso? A ordem dos joins melhorou?"
5. **Itere.** Se o CBO disser que a reescrita é pior, o modelo sabe. Ele pode tentar novamente com essa informação, em vez de continuar adivinhando.

A etapa 4 é a que muda a economia. Sem ela, o modelo converge para o que seus priors dizem ser bom SQL Oracle. Com ela, o modelo é restringido pela avaliação real do otimizador sobre a reescrita no esquema real com as estatísticas reais. A convergência é mais rápida e as sugestões têm mais chance de sobreviver em produção.

Aqui está o padrão central para capturar um plano em um formato útil como entrada para o modelo:

```sql
EXPLAIN PLAN SET STATEMENT_ID = 'VEESKER_AI_ANTES' FOR
  SELECT /*+ consulta original aqui */
    o.order_id,
    c.nome_cliente,
    SUM(oi.preco_unitario * oi.quantidade) AS total_pedido
  FROM pedidos o
  JOIN clientes c ON c.id_cliente = o.id_cliente
  JOIN itens_pedido oi ON oi.order_id = o.order_id
  WHERE o.status = 'PENDENTE'
    AND o.data_criacao >= TRUNC(SYSDATE) - 30
  GROUP BY o.order_id, c.nome_cliente;

SELECT * FROM TABLE(
  DBMS_XPLAN.DISPLAY(
    'PLAN_TABLE', 'VEESKER_AI_ANTES', 'ALL'
  )
);
```

A opção de formato `'ALL'` inclui informações de predicado e projeção de colunas — as seções sobre as quais uma IA consegue raciocinar com mais eficácia. O texto do plano é então incluído literalmente no contexto do modelo junto com a consulta.

Após a IA propor uma reescrita, você executa o mesmo padrão com `STATEMENT_ID = 'VEESKER_AI_DEPOIS'` e compara as duas saídas. O diff que você devolve ao modelo não é uma medição de tempo real; é uma comparação estrutural do mesmo otimizador com as mesmas estatísticas. Essa consistência é exatamente o que o torna útil como feedback.

## O que o modelo pode e não pode fazer com o plano

O que funciona bem: com dois planos lado a lado, um modelo capaz consegue identificar que a reescrita mudou um full table scan para um index range scan, observar se a estimativa de cardinalidade melhorou ou piorou, e perceber que um predicado passou de filtro para acesso. Essas são observações estruturais que o modelo consegue fazer de forma confiável porque aparecem explicitamente no texto do plano.

O que não funciona: pedir ao modelo que preveja o tempo real de execução a partir do custo estimado. A unidade de custo do CBO não é milissegundos de clock. Um plano com custo estimado 42 não é necessariamente mais rápido na prática do que um com custo estimado 89. O modelo de custo é internamente consistente, não calibrado externamente em relação ao tempo de execução. Uma IA que afirma que sua consulta "vai rodar 2x mais rápido" com base no EXPLAIN PLAN está gerando um número sem base no texto do plano.

O enquadramento correto é: "O custo estimado diminuiu e o formato do plano mudou de formas que tipicamente são favoráveis para esse padrão de acesso. Verifique com estatísticas reais de execução antes de tratar isso como confirmado." Isso é honesto. E também é mais útil do que um número confiante que pode estar errado.

## Onde as estatísticas se encaixam

As estimativas de custo do CBO são tão boas quanto as estatísticas disponíveis para o otimizador. Se o `DBMS_STATS` não foi executado recentemente, as estimativas estão baseadas em distribuições de dados antigas, e comparar planos significa comparar duas estruturas construídas sobre premissas incorretas.

Coletar estatísticas antes de uma sessão de ajuste não é uma etapa burocrática — é um pré-requisito para que a comparação de planos faça sentido. Em bancos com coleta automática de estatísticas ativada (padrão desde Oracle 10g), isso geralmente já está resolvido. Em bancos onde a coleta automática está desativada ou onde a tabela cresceu significativamente desde a última coleta, faça manualmente:

```sql
EXEC DBMS_STATS.GATHER_TABLE_STATS(
  ownname  => 'SEU_SCHEMA',
  tabname  => 'PEDIDOS',
  cascade  => TRUE,     -- inclui índices
  estimate_percent => DBMS_STATS.AUTO_SAMPLE_SIZE
);
```

A opção `AUTO_SAMPLE_SIZE` deixa o Oracle escolher um tamanho de amostra estatisticamente adequado, sem exigir um full scan da tabela para a coleta. Em versões anteriores ao 11g, o algoritmo de amostragem automática é menos sofisticado; para instâncias 9i e 10g, um percentual fixo de estimativa entre 20 e 30 é um padrão razoável.

## Bind variable peeking e planos adaptativos

Dois cenários em que um EXPLAIN PLAN estático não vai corresponder ao plano em tempo de execução:

**Bind variable peeking.** O EXPLAIN PLAN captura o plano com base nos valores literais presentes na consulta ou nos primeiros valores das bind variables no momento do explain. Para consultas cuja forma de plano ideal é sensível à distribuição dos valores das bind variables — comum em predicados de range em colunas com distribuição assimétrica — o EXPLAIN PLAN pode mostrar um plano diferente do que o V$SQL_PLAN mostra para execuções reais. Para essas consultas, `DBMS_XPLAN.DISPLAY_CURSOR` em uma execução real é a fonte autoritativa.

**Planos adaptativos.** O Oracle 12c introduziu planos de consulta adaptativos que podem mudar de forma durante a execução com base em contagens reais de linhas divergindo das estimativas. Um EXPLAIN PLAN estático não captura as operações de estatísticas adaptativas. Para analisar comportamento de planos adaptativos, consulte `V$SQL_PLAN` com a opção de formato `ADAPTIVE`, que mostra o plano completo incluindo os ramos que o otimizador poderia ter seguido.

Nenhum desses cenários é razão para pular o ciclo de feedback do EXPLAIN PLAN. São razões para saber o que ele está realmente medindo e quando usar um instrumento mais detalhado.

## A implementação no Veesker

Na versão Community Edition atual do Veesker, o fluxo de EXPLAIN PLAN é uma ação de primeira classe no editor de consultas. Você pode executar EXPLAIN, visualizar o plano em uma árvore gráfica ou em texto plano, e copiar o texto formatado do plano. O contexto de IA para qualquer consulta inclui o esquema ativo, a versão do servidor conectado e quaisquer hints presentes na consulta. A IA não sugere `FETCH FIRST N ROWS ONLY` em uma conexão 11g ou `VECTOR_DISTANCE` em uma instância 12c — o contexto de versão é ancorado no nível da conexão, não inferido do conteúdo da consulta.

O padrão de ajuste em ciclo fechado — a IA propõe uma reescrita, ambos os planos são capturados e comparados, o modelo itera com o diff — faz parte da camada Cloud gerenciada, prevista para H2 2026. Quando essa camada for lançada, a sessão manterá um histórico de planos ao longo das reescritas dentro de uma sessão de ajuste. O modelo não avalia cada sugestão de forma independente, mas em relação a um registro acumulado do que melhorou ou piorou o plano no seu esquema e distribuição de dados específicos. A camada gerenciada cuida da captura do plano, diff e injeção de contexto automaticamente.

O aplicativo desktop para a comunidade já faz o mesmo trabalho hoje, com as etapas manuais descritas acima. A camada Cloud elimina o overhead de orquestração, não o conceito em si. Se você já executa EXPLAIN PLAN nas suas consultas lentas — o que deveria fazer independentemente de ferramentas de IA — o ciclo de feedback é apenas um passo a mais: inclua o texto do plano no contexto que você passa ao modelo, e inclua o plano da reescrita quando pedir a próxima iteração.

---

O fluxo de EXPLAIN PLAN está disponível no Veesker Community Edition — local-first, Apache 2.0, conecta a todas as versões Oracle de 9i a 26ai sem instalação separada de cliente. Faça o download em [veesker.cloud/download](/download).

— *Veesker*
