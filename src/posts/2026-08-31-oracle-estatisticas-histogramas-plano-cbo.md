---
title: "Oracle: estatísticas e histogramas — por que o plano do CBO muda quando você coleta stats"
description: "O Otimizador Baseado em Custo é tão bom quanto as estatísticas que ele lê. Entender como o Oracle coleta e usa estatísticas — e onde os histogramas se encaixam — é a base da estabilidade de planos."
date: "2026-08-31"
slug: "oracle-estatisticas-histogramas-plano-cbo"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "performance", "estatisticas", "cbo", "histogramas"]
translation_slug: "oracle-statistics-histograms-cbo-plan"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Uma query roda bem por seis meses. Aí alguém executa `DBMS_STATS.GATHER_TABLE_STATS` na tabela principal — ou o job de manutenção do fim de semana chega antes — e o plano de execução muda. Às vezes para melhor. Às vezes de forma dramaticamente pior. A equipe abre o incidente, reverte as estatísticas com `DBMS_STATS.RESTORE_TABLE_STATS` e abre um ticket para "revisar quando as coisas acalmarem".

Esse padrão é comum o suficiente para virar conhecimento tribal: "colete estatísticas com cuidado, colete com pouca frequência e guarde um ponto de restauração". Esse conselho não está errado, mas trata o sintoma. O problema de fundo é que a maioria dos desenvolvedores Oracle não tem um modelo preciso do que o CBO realmente lê, e muito menos do que os histogramas contêm e por que mudam as decisões do otimizador.

Este post preenche essa lacuna. Sem benchmarks inventados, sem limites mágicos — apenas uma descrição precisa do que o Oracle armazena e de como o otimizador usa esses dados.

## O que o CBO conhece

O Otimizador Baseado em Custo (Cost-Based Optimizer) seleciona um plano de execução estimando o custo de cada plano candidato, onde custo é uma proxy de I/O e CPU. Para estimar custo, o otimizador estima a *cardinalidade* em cada etapa: quantas linhas este full scan retorna? Quantas sobrevivem a este filtro? Quantas linhas este join produz?

As estimativas de cardinalidade vêm das estatísticas. O Oracle armazena dois tipos principais.

**Estatísticas de objeto** descrevem a tabela como um todo. As colunas relevantes em `DBA_TABLES` (ou `ALL_TABLES` para o que o seu usuário vê) são `NUM_ROWS`, `BLOCKS` e `AVG_ROW_LEN`. `LAST_ANALYZED` diz quando essas informações foram coletadas pela última vez. O otimizador usa `NUM_ROWS` constantemente — divide por `NUM_DISTINCT` em uma coluna para estimar a seletividade de filtros, e multiplica pela seletividade do join para estimar o tamanho do resultado.

**Estatísticas de coluna** descrevem colunas individualmente. `DBA_TAB_COLUMNS` (ou `DBA_TAB_COL_STATISTICS` para o subconjunto analisado) contém `NUM_DISTINCT`, `NUM_NULLS`, `DENSITY`, `LOW_VALUE`, `HIGH_VALUE`, além de `NUM_BUCKETS` e o tipo de `HISTOGRAM`. São esses os números que o otimizador aplica ao avaliar predicados `WHERE` e condições de join.

A fórmula básica de cardinalidade para um predicado de igualdade em uma coluna sem histograma é: `NUM_ROWS / NUM_DISTINCT`. Se uma tabela tem 10 milhões de linhas e a coluna tem 50.000 valores distintos, o otimizador assume que cada valor aparece 200 vezes e estima que um filtro em qualquer valor retorna 200 linhas. Isso está correto quando os dados são distribuídos uniformemente. Está muito errado quando não estão.

## Onde entram os histogramas

Os histogramas existem exatamente para dados não uniformes. Eles registram a forma real da distribuição dos valores de uma coluna — não apenas a contagem de valores distintos.

O Oracle suporta quatro tipos de histograma, determinados no momento da coleta com base nas características da coluna.

**Histogramas de frequência** são criados quando o número de valores distintos é suficientemente pequeno — especificamente, igual ou abaixo do limite de buckets (2048 buckets no Oracle 12c e posterior; 254 nas versões anteriores). Cada bucket representa um único valor distinto e armazena a contagem cumulativa de linhas até aquele valor. Com um histograma de frequência, o otimizador conhece a contagem exata de linhas para cada valor distinto — sem precisar assumir uniformidade.

**Histogramas balanceados por altura** eram o fallback antes do Oracle 12c para colunas com muitos valores distintos. Cada um dos 254 buckets continha aproximadamente o mesmo número de linhas. Valores populares apareciam como endpoints repetidos — um endpoint repetido sinaliza que aquele bucket é dedicado a um único valor popular. Histogramas balanceados por altura ainda são criados no 12c+ quando uma coluna não se qualifica para os tipos mais novos, mas top-frequency e hybrid são preferidos.

**Histogramas top-frequency** (introduzidos no Oracle 12c) lidam com o caso comum em que uma coluna tem muitos valores distintos, mas uma pequena quantidade deles responde pela maioria das linhas. O otimizador armazena contagens exatas para os N valores mais frequentes e agrupa o restante em um bucket residual. Se 95% da sua coluna `STATUS` é `'ATIVO'` e `'FECHADO'`, com quarenta outros valores compartilhando os 5% restantes, um histograma top-frequency captura os valores dominantes com exatidão.

**Histogramas híbridos** (também Oracle 12c+) combinam as abordagens. Usam buckets balanceados por altura para cobrir o intervalo completo de valores, mas também armazenam contagens exatas para os valores populares que de outra forma seriam absorvidos em um bucket compartilhado. Isso dá ao otimizador cardinalidade precisa para os valores mais comuns e uma aproximação razoável para a cauda.

## Por que coletar estatísticas muda o plano

Com esse contexto, os cenários comuns de mudança de plano ficam concretos.

Uma tabela cresce significativamente — por exemplo, uma tabela `VENDAS` dobra em um trimestre. As estatísticas de objeto estão desatualizadas. O `NUM_ROWS` do otimizador é metade da realidade, então todas as estimativas de cardinalidade a partir dali são reduzidas à metade. Um full scan que antes parecia caro agora parece barato. Um nested loops join que estava corretamente calculado para 1 milhão de linhas agora parece lidar com 500.000, possivelmente substituindo um hash join que teria melhor desempenho. Coletar apenas as estatísticas de objeto restaura a escala correta.

Uma mudança de assimetria nos dados é mais sutil. Uma coluna `REGIAO` tinha dados distribuídos entre dez regiões historicamente. Um lançamento de produto empurrou 70% de todas as linhas para uma região. Antes da atualização do histograma, o otimizador estimava cada região em 10% de seletividade e escolhia um full scan para um filtro por região. Após coletar estatísticas com `SIZE AUTO` nessa coluna, o otimizador vê um histograma top-frequency mostrando a região dominante em 70% e a cauda compartilhando 30%. Uma query filtrando por uma das regiões raras agora recebe uma estimativa corretamente baixa de cardinalidade e pode selecionar um index range scan. Uma query filtrando pela região dominante recebe uma estimativa corretamente alta e permanece com o full scan.

A mudança de plano não é uma regressão. É o otimizador corrigindo uma imagem distorcida.

## Coletando estatísticas de forma deliberada

O procedimento relevante é `DBMS_STATS.GATHER_TABLE_STATS`. Os parâmetros que mais importam para uso em produção:

`estimate_percent => DBMS_STATS.AUTO_SAMPLE_SIZE` é o padrão no Oracle 11g e posterior e deve permanecer como padrão. O Oracle usa um algoritmo de amostragem em dois passos (introduzido no 11g) que determina um tamanho de amostra adequado com base em estimativas de NDV da coluna. Não defina uma porcentagem fixa a menos que tenha um motivo documentado.

`method_opt => 'FOR ALL COLUMNS SIZE AUTO'` instrui o Oracle a coletar histogramas com base no rastreamento de uso de colunas — especificamente, se o Oracle observou que uma coluna aparece em cláusulas `WHERE` desde a última coleta. Colunas que nunca apareceram em um predicado não recebem histogramas. Colunas frequentemente filtradas os recebem. Este é o padrão correto para a maioria das cargas de trabalho.

`cascade => TRUE` coleta estatísticas de índice ao mesmo tempo. Estatísticas de índice ausentes forçam o otimizador a fazer estimativas cegas sobre a seletividade do índice. Defina como true ao coletar em uma tabela que foi significativamente modificada.

`no_invalidate => FALSE` permite que o Oracle invalide e reanalise cursores que referenciam a tabela imediatamente após a coleta de estatísticas. A alternativa, `DBMS_STATS.AUTO_INVALIDATE` (o padrão), invalida cursores gradualmente durante uma janela de distribuição para evitar uma tempestade repentina de reanálise em um sistema ocupado. Em desenvolvimento ou homologação, `FALSE` dá retorno imediato. Em produção, o padrão é mais suave.

## Estatísticas obsoletas e o job de manutenção

O Oracle marca estatísticas como obsoletas quando um limiar de monitoramento é ultrapassado. Por padrão, as estatísticas são consideradas obsoletas quando pelo menos 10% das linhas de uma tabela foram inseridas, atualizadas ou excluídas desde a última coleta. A view `DBA_TAB_MODIFICATIONS` acumula contagens de alterações; `DBA_TAB_STATISTICS` tem uma coluna `STALE_STATS` que reflete a comparação.

O job automático de manutenção — `GATHER_STATS_JOB`, executando sob o Oracle Scheduler dentro de uma janela de manutenção — coleta estatísticas em objetos obsoletos durante horários de baixo movimento. As janelas padrão são das 22h às 6h em dias úteis e o dia todo nos fins de semana, embora isso varie conforme a configuração. Em um sistema com alto volume diário de escrita, o job pode recoletar estatísticas das principais tabelas toda noite — por isso um plano estável durante o dia pode parecer diferente na manhã seguinte.

Bloquear estatísticas de uma tabela com `DBMS_STATS.LOCK_TABLE_STATS` impede que qualquer coleta automática as altere até que sejam explicitamente desbloqueadas. Esse é o mecanismo correto em produção quando um conjunto de estatísticas é conhecido por produzir um bom plano e não deve sofrer deriva.

## O que isso parece no Veesker

O navegador de esquema do Veesker exibe `LAST_ANALYZED` em cada tabela e índice na sua árvore de objetos. Quando você abre uma tabela, o painel de estatísticas mostra `NUM_ROWS`, `BLOCKS` e o indicador de obsolescência de `DBA_TAB_STATISTICS`. As estatísticas de coluna e os tipos de histograma estão visíveis no nível da coluna — você pode ver se uma determinada coluna tem um histograma de frequência, top-frequency, híbrido ou nenhum, e quando foi analisada pela última vez.

Esses são os mesmos dados que o otimizador está lendo. Quando um `EXPLAIN PLAN` produz uma estimativa de cardinalidade que não corresponde à sua intuição sobre os dados, o ponto de partida é sempre as estatísticas a que o otimizador teve acesso — e vê-las inline, na mesma ferramenta, reduz consideravelmente o ciclo de depuração.

A arquitetura local-first significa que nenhum desses metadados de esquema sai da sua máquina. O Veesker lê o dicionário de dados pela sua conexão existente, exibe localmente e mantém local. A Community Edition está sob licença Apache 2.0 e pode ser baixada gratuitamente. A camada Cloud, que adicionará análise de planos assistida por IA e sugestões com contexto de esquema, chega no segundo semestre de 2026.

---

Se você passa tempo lendo saídas de `EXPLAIN PLAN`, entender as estatísticas por trás delas é o próximo passo. [Baixe o Veesker](/download) e comece pelo painel de estatísticas da sua tabela mais pesada.

— *Veesker*
