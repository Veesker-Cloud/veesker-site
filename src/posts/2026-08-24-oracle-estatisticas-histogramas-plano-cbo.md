---
title: "Oracle: estatísticas e histogramas — por que o plano do CBO muda quando você coleta estatísticas"
description: "O otimizador baseado em custo nunca examina seus dados em tempo de parse — apenas as estatísticas. Entender histogramas é o que evita regressões de plano antes que cheguem à produção."
date: "2026-08-24"
slug: "oracle-estatisticas-histogramas-plano-cbo"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "cbo", "estatísticas", "histogramas", "performance"]
translation_slug: "oracle-statistics-histograms-cbo-plan"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

A ligação chega numa segunda-feira à tarde: uma query que rodava em 300 ms na semana passada agora leva 12 segundos. Nada no código mudou. Os índices continuam lá. O modelo de dados é idêntico. Mas durante o fim de semana o DBA executou `DBMS_STATS.GATHER_DATABASE_STATS` na instância de produção, e o otimizador baseado em custo escolheu um plano de execução completamente diferente.

Isso não é um bug. O otimizador está fazendo exatamente o que foi projetado para fazer — e o fato de que o novo plano é mais lento diz algo preciso: as estatísticas que ele acabou de coletar são mais precisas do que as anteriores, e revelaram uma distribuição de dados para a qual o plano antigo não foi construído.

Entender o que mudou, e por quê, começa em como o CBO toma suas decisões.

## O que o CBO realmente precisa

O otimizador baseado em custo do Oracle constrói planos de execução estimando o número de linhas que uma determinada operação retornará — a cardinalidade — e então comparando o custo estimado de diferentes caminhos de acesso para escolher o mais barato. Varredura completa de tabela ou varredura de intervalo por índice. Nested loop ou hash join. Sort-merge ou broadcast. Cada ramificação nessa árvore de decisão depende de uma estimativa de cardinalidade.

As estimativas de cardinalidade são tão boas quanto as estatísticas que o CBO tem no momento do parse. As estatísticas do Oracle são metadados armazenados no dicionário de dados — principalmente em `DBA_TAB_STATISTICS`, `DBA_COL_STATISTICS` e views relacionadas — que descrevem a forma dos dados em cada tabela e índice. O CBO as lê no momento do parse. Ele nunca inspeciona linhas reais enquanto constrói um plano.

Se as estatísticas estão ausentes, desatualizadas ou enganosas, o CBO recorre a padrões que quase certamente estarão errados para seus dados. O plano resultante pode ter sido correto quando as estatísticas eram recentes. Após uma carga em lote de grande volume ou uma mudança sazonal nos dados, pode estar catastroficamente errado.

## Os números básicos: linhas, NDV, nulos e densidade

Para cada tabela, o Oracle rastreia algumas métricas fundamentais:

- `NUM_ROWS`: contagem de linhas no momento da última coleta.
- `BLOCKS`: número de blocos de dados que a tabela ocupa.
- `AVG_ROW_LEN`: tamanho médio de linha em bytes.

Para cada coluna:

- `NUM_DISTINCT` (NDV): contagem de valores distintos.
- `NUM_NULLS`: linhas com valor nulo.
- `LOW_VALUE` / `HIGH_VALUE`: valores mínimo e máximo, armazenados em formato interno bruto.
- `DENSITY`: uma única estimativa de seletividade derivada do NDV.

Quando você executa `WHERE status = 'ATIVO'`, o CBO usa o NDV e a densidade da coluna para estimar quantas linhas o predicado seleciona. Se a coluna tem 5 valores distintos e nenhum histograma, o otimizador assume distribuição uniforme: cada valor corresponde a um quinto da tabela. Em dados uniformemente distribuídos, essa estimativa é suficientemente precisa. Em dados reais de produção, quase sempre está errada.

## O problema com a suposição de distribuição uniforme

Considere uma tabela `PEDIDOS` com 10 milhões de linhas e uma coluna `STATUS` com cinco valores: `'ABERTO'`, `'PROCESSANDO'`, `'ENVIADO'`, `'ENTREGUE'` e `'CANCELADO'`. Cinco valores distintos. Sem histograma, o CBO assume que cada status aparece em 2 milhões de linhas — 20% da tabela.

Na prática, 97% dos pedidos são `'ENTREGUE'` ou `'CANCELADO'`. Apenas 1,5% são `'ABERTO'`, e `'PROCESSANDO'` é um estado transitório que mantém no máximo alguns milhares de linhas em determinado momento.

Uma query para `WHERE status = 'PROCESSANDO'` deveria selecionar cerca de 0,03% da tabela — uma varredura de intervalo por índice é quase certamente o caminho correto. Uma query para `WHERE status = 'ENTREGUE'` deveria selecionar 60% da tabela — uma varredura completa é mais rápida. Sem histograma, o CBO vê ambos os predicados como "20% de 10 milhões de linhas" e pode escolher o caminho errado para os dois.

É essa lacuna que os histogramas preenchem. Um histograma substitui a suposição de distribuição uniforme por um modelo por coluna da distribuição real dos valores.

## Tipos de histograma que o Oracle mantém

O Oracle mantém quatro tipos de histograma. Qual deles é criado depende do NDV da coluna em relação ao limite de buckets configurado (controlado por `METHOD_OPT`, com padrão de 254 buckets nas versões recentes).

**Histograma de frequência**: criado quando o NDV é pequeno o suficiente para cada valor distinto ter seu próprio bucket. Cada bucket registra um valor e sua contagem exata de linhas. O CBO sabe precisamente quantas linhas contêm cada valor distinto. É o tipo mais preciso e a escolha padrão para colunas de baixa cardinalidade como códigos de status, flags booleanas e discriminadores de tipo.

**Histograma de frequência por topo** (12c em diante): para colunas onde o NDV excede o limite de buckets mas um pequeno conjunto de valores domina a distribuição, o Oracle rastreia os N valores mais frequentes e agrupa o restante em um catch-all. Isso captura a maior parte do benefício analítico com uma fração do custo de armazenamento.

**Histograma de altura balanceada**: a forma mais antiga, que preenche cada bucket com um número igual de linhas e registra o valor do ponto de extremidade. Menos preciso que histogramas de frequência para colunas de baixa cardinalidade, mas ainda útil para predicados de intervalo em colunas numéricas contínuas ou de data.

**Histograma híbrido** (12c em diante): uma combinação dos anteriores — valores de alta frequência recebem buckets dedicados; os demais usam a abordagem de altura balanceada. Captura a assimetria no topo da distribuição sem perder cobertura da cauda longa.

O Oracle escolhe entre eles automaticamente durante a coleta de estatísticas com base no NDV da coluna e na configuração de `METHOD_OPT`. Você pode verificar qual tipo uma coluna possui consultando `DBA_TAB_COL_STATISTICS.HISTOGRAM`.

## Por que estatísticas desatualizadas causam regressões de plano

A tarefa de manutenção automática de coleta de estatísticas do Oracle executa durante a janela de manutenção padrão (tipicamente noturna), coletando estatísticas de tabelas cujos dados mudaram mais de 10% desde a última coleta. Em sistemas OLTP ativos, esse limiar pode disparar coletas nas tabelas transacionais principais todas as noites.

O padrão de regressão é assim: um job de lote roda no domingo à noite, inserindo um grande volume de linhas em uma tabela de staging. A tarefa automática dispara, coleta estatísticas atualizadas, e o CBO agora vê essa tabela como 200× maior do que via no dia anterior. Uma query que fazia join com essa tabela usando nested loop — porque ela era "pequena" — agora escolhe hash join — porque ela é "grande." A mudança de plano segue logicamente das novas estatísticas. Mas se o orçamento de tempo de resposta da query assumia o comportamento de nested loop, a performance cai abruptamente.

A correção quase nunca é "reverter a coleta de estatísticas." A correção é entender o que as novas estatísticas revelaram sobre os dados e ajustar a query para lidar corretamente com ambas as distribuições.

## Coletando estatísticas de forma deliberada

O padrão `DBMS_STATS.GATHER_DATABASE_STATS(OPTIONS => 'GATHER AUTO')` é adequado para a maioria das cargas de trabalho. Para tabelas onde a estabilidade do plano importa mais do que a atualidade das estatísticas, duas técnicas são úteis.

**Bloquear estatísticas**: `DBMS_STATS.LOCK_TABLE_STATS('SCHEMA', 'NOME_TABELA')` impede que a tarefa automática sobrescreva estatísticas criadas manualmente ou importadas. Use isso para tabelas de lookup, tabelas de calendário ou qualquer tabela cuja distribuição de dados é efetivamente estática.

**Estatísticas pendentes**: Configurar `PUBLISH` como `FALSE` em uma tabela faz com que as estatísticas recém-coletadas fiquem em estado pendente em vez de entrarem em vigor imediatamente. Você pode então testar as estatísticas pendentes definindo `OPTIMIZER_USE_PENDING_STATISTICS = TRUE` no nível da sessão, confirmar que o comportamento do plano é aceitável, e publicar com `DBMS_STATS.PUBLISH_PENDING_STATS`. Esse é o fluxo correto quando você precisa validar uma coleta de estatísticas antes de aplicá-la em produção.

Estatísticas estendidas (`DBMS_STATS.CREATE_EXTENDED_STATS`) permitem coletar estatísticas sobre grupos de colunas — pares ou tuplas de colunas frequentemente filtradas juntas. Se suas queries costumam filtrar em `REGIAO` e `STATUS` simultaneamente, a estimativa do otimizador para o predicado combinado será mais precisa com uma estatística de grupo de colunas do que com duas estatísticas de coluna única multiplicadas entre si.

## Lendo as estimativas do CBO na saída do plano

Quando uma query regride após uma coleta de estatísticas, examine as estimativas de cardinalidade no plano de execução antes de analisar os caminhos de acesso. O caminho de acesso é o sintoma. A estimativa de cardinalidade é a causa.

```sql
EXPLAIN PLAN FOR
  SELECT p.pedido_id, c.nome_cliente
  FROM pedidos p
  JOIN clientes c ON c.id = p.cliente_id
  WHERE p.status = 'PROCESSANDO';

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(FORMAT => 'ALL'));
```

Na saída, compare a coluna `Rows` (cardinalidade estimada) com as contagens reais de linhas em tempo de execução, visíveis em `DBMS_XPLAN.DISPLAY_CURSOR` com o formato `ALLSTATS LAST` após executar a query com `GATHER_PLAN_STATISTICS`:

```sql
SELECT /*+ GATHER_PLAN_STATISTICS */ p.pedido_id, c.nome_cliente
FROM pedidos p
JOIN clientes c ON c.id = p.cliente_id
WHERE p.status = 'PROCESSANDO';

SELECT * FROM TABLE(
  DBMS_XPLAN.DISPLAY_CURSOR(FORMAT => 'ALLSTATS LAST')
);
```

Uma grande discrepância em uma determinada etapa — digamos, 2.000.000 estimado onde na realidade são 4.500 — é o CBO indicando exatamente onde o seu modelo falhou. Quase sempre é onde um histograma ausente ou desatualizado está causando dano. Uma coluna com cardinalidade estimada muito errada vai distorcer cada ordem de join, método de join e caminho de acesso que dependem dessa estimativa.

O visualizador de EXPLAIN PLAN do Veesker exibe cardinalidade estimada e real lado a lado quando estatísticas de execução estão disponíveis, tornando essa comparação imediata em vez de exigir uma chamada manual a `DBMS_XPLAN.DISPLAY_CURSOR`.

## Uma relação mais produtiva com o otimizador

O CBO não é opaco. Cada plano que ele produz segue das estatísticas que tem acesso. Quando um plano muda após uma coleta de estatísticas, a pergunta certa não é "como impedir que as estatísticas mudem o plano?" mas "o que as novas estatísticas revelaram sobre os meus dados que o plano antigo não foi construído para lidar?"

Histogramas são o mecanismo que transforma metadados no nível de coluna de uma estimativa grosseira em um modelo funcional da realidade. Entender qual tipo de histograma cobre qual distribuição — e quando bloquear, deixar pendente ou coletar estatísticas novas — é a diferença entre reagir a regressões de plano e antecipá-las.

O otimizador está do seu lado. Dê a ele informações precisas e ele lhe dará um plano adequado. Dê a ele informações desatualizadas ou ausentes e ele lhe dará o melhor plano que consegue construir a partir de uma premissa errada. A coleta de estatísticas não é inimiga da estabilidade do plano; ela é o pré-requisito para ela.

---

Baixe o Veesker para explorar seus planos de execução com cardinalidade estimada e real lado a lado: [veesker.cloud/download](/download).

— *Veesker*
