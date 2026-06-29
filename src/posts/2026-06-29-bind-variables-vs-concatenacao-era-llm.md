---
title: "Bind variables vs concatenação de strings: ainda relevante na era dos LLMs"
description: "LLMs treinados em código web tendem a gerar SQL com concatenação de strings. Veja por que isso é um problema de performance no Oracle e como a IA com schema-awareness evita esse padrão."
date: "2026-06-29"
slug: "bind-variables-vs-concatenacao-era-llm"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "performance", "sql", "ai", "plsql"]
translation_slug: "bind-variables-vs-string-concatenation-llm-era"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

O argumento a favor de bind variables em vez de concatenação de strings existe desde o Oracle 7. Está em todos os livros de performance do Oracle, em todos os checklists de onboarding de DBA, em todas as versões do *Oracle Database 2 Day + Performance Tuning Guide*. Você poderia imaginar que, em 2026, o assunto estaria encerrado.

Não está encerrado. Porque agora quem escreve SQL com frequência não são mais desenvolvedores que leram livros de performance do Oracle — são pessoas pedindo a um LLM que escreva o SQL por elas. E LLMs, entregues à própria distribuição de treinamento, optam por concatenação de strings. O problema não desapareceu. Ele encontrou uma nova origem.

## O que o compartilhamento de cursores realmente faz

O shared pool do Oracle mantém um library cache: uma coleção de instruções SQL compiladas, indexadas por hash. Quando você executa uma instrução SQL, o Oracle calcula o hash do texto exato, procura no library cache e, se encontrar correspondência, reutiliza o plano de execução já parseado e otimizado. Isso é um **soft parse** — alguns microssegundos, efetivamente gratuito.

Se a instrução não estiver no library cache, o Oracle precisa fazer um hard parse: analisar o texto, verificar a sintaxe, validar privilégios sobre os objetos, e construir o plano de query usando o otimizador baseado em custo. Em uma query simples, um hard parse adiciona milissegundos. Em uma query complexa com joins, subqueries e hints, pode levar dezenas de milissegundos. Em uma aplicação de alta vazão executando milhares de queries por segundo, o custo acumulado não é trivial.

O detalhe: o hash é calculado sobre o **texto literal** da instrução SQL. Duas queries que diferem por um único caractere são tratadas como duas instruções completamente distintas.

```sql
-- Essas três instruções geram três entradas diferentes no library cache:
SELECT * FROM orders WHERE customer_id = 1001
SELECT * FROM orders WHERE customer_id = 1002
SELECT * FROM orders WHERE customer_id = 1003
```

Substitua o literal por uma bind variable, e as três instruções se tornam uma:

```sql
SELECT * FROM orders WHERE customer_id = :cust_id
```

Um hard parse, uma entrada no library cache, milhares de soft parses reutilizando o mesmo plano. Isso é cursor sharing, e é a razão pela qual o shared pool do Oracle existe.

## Por que a concatenação de strings polui o shared pool

Toda vez que você constrói uma string SQL concatenando um valor ao texto, você garante uma instrução única que jamais encontrará correspondência com uma entrada anterior. Em uma procedure PL/SQL que executa dez mil vezes por hora, isso representa dez mil hard parses por hora — cada um adquirindo latches do library cache, cada um rodando o otimizador, cada um inflando o shared pool com entradas que são descartadas antes de poderem ser reutilizadas.

As manifestações de performance são específicas. Você verá alto *parse time elapsed* em `V$SQL`. Verá esperas excessivas por *library cache latch* em `V$SESSION_WAIT`. Verá um shared pool que rotaciona tão rápido que `V$SQLAREA` mostra quase todas as instruções com `EXECUTIONS = 1`. Verá uso de CPU no servidor do banco de dados que acompanha de perto o volume de queries, em vez do volume de dados ou de I/O.

No Oracle 9i e 10g, esse anti-padrão era tão comum que a Oracle entregou `cursor_sharing = FORCE` como válvula de escape emergencial — um parâmetro que força o banco de dados a substituir literais por bind variables geradas pelo sistema no momento do parse. Funciona, de forma precária. Interfere com histogramas e pode fazer o otimizador escolher planos piores para colunas com distribuições de dados assimétricas. Ainda é documentado; não é uma solução.

A solução é não gerar SQL com concatenação de strings desde o começo.

## LLMs optam pelo lado errado

Veja o que um LLM genérico produz quando você pede uma procedure PL/SQL para buscar detalhes de pedidos:

```sql
-- O que um LLM genérico tende a gerar:
PROCEDURE get_order(p_order_id NUMBER) IS
  v_sql VARCHAR2(200);
BEGIN
  v_sql := 'SELECT * FROM orders WHERE order_id = ' || p_order_id;
  EXECUTE IMMEDIATE v_sql;
END;
```

O modelo não está alucinando algo que não conhece. Ele está reproduzindo fielmente o padrão que aparece com mais frequência em seus dados de treinamento. Tutoriais na web, respostas no Stack Overflow, exemplos de código de uma década de posts em blogs — uma parcela significativa deles usa concatenação de strings para SQL dinâmico porque é o caminho de menor resistência ao escrever um exemplo rápido.

A versão correta não é difícil:

```sql
PROCEDURE get_order(p_order_id NUMBER) IS
  v_sql VARCHAR2(200);
BEGIN
  v_sql := 'SELECT * FROM orders WHERE order_id = :oid';
  EXECUTE IMMEDIATE v_sql USING p_order_id;
END;
```

A cláusula `USING` passa o valor da bind variable separadamente do texto SQL. O Oracle faz o parse do texto uma vez e reutiliza o plano a cada chamada. O shared pool permanece limpo.

Para SQL estático — que é o que você deve usar quando a estrutura da instrução é fixa — não há `EXECUTE IMMEDIATE` algum:

```sql
PROCEDURE get_order(p_order_id NUMBER) IS
  v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE order_id = p_order_id;
  -- p_order_id aqui é implicitamente uma bind variable
END;
```

SQL estático em PL/SQL sempre usa bind variables. O compilador PL/SQL do Oracle cuida disso. O risco está confinado ao SQL dinâmico, e o risco está inteiramente em o desenvolvedor usar `||` ou `USING`.

## A nota de rodapé sobre SQL injection (ainda aplicável)

O argumento de performance é o dominante no trabalho com Oracle, mas vale nomear o outro: concatenação de strings é também como o SQL injection acontece. Se `p_order_id` fosse um VARCHAR2 em vez de um NUMBER, quem chamasse poderia passar `1 OR 1=1 --` e ler a tabela inteira. Com uma bind variable, o valor nunca é interpolado no texto da instrução — é passado como dado, não como código. A estrutura da instrução fica fixada no momento do parse.

Em um ambiente de banco de dados onde os schemas contêm dados sensíveis de produção, isso não é uma preocupação teórica. Bind variables não são apenas uma otimização de performance; elas são a fronteira entre o texto da instrução e os dados da instrução.

## O que a IA com schema-awareness faz de diferente

A camada de IA do Veesker envia a versão do servidor Oracle e o contexto do schema para o modelo junto com a query. Essa mudança de contexto afeta o que o modelo gera.

Quando o modelo sabe que está escrevendo PL/SQL para Oracle 19c, ele sabe que SQL estático é preferível ao SQL dinâmico para queries de estrutura fixa, e que SQL dinâmico requer a cláusula `USING` para bind variables. Ele sabe que o idioma correto para queries parametrizadas em PL/SQL Oracle não é concatenação com `||` — não porque lhe disseram "não faça isso", mas porque o grounding desloca a distribuição em direção a padrões corretos para Oracle.

Há uma ilustração prática. Peça a um assistente genérico para escrever um loop de cursor filtrando por departamento. Com frequência você obterá:

```sql
FOR rec IN (SELECT * FROM employees WHERE dept_id = ' || p_dept || ') LOOP
```

Faça a mesma pergunta na janela de queries do Veesker, onde o schema está carregado e o servidor é Oracle 19c, e você obtém:

```sql
FOR rec IN (SELECT * FROM employees WHERE dept_id = p_dept) LOOP
```

SQL estático, bind variable implícita, sem interpolação de strings, sem poluição do shared pool. A diferença não é um modelo diferente — é um contexto diferente alimentando o mesmo modelo.

A camada Cloud (prevista para o segundo semestre de 2026) adiciona feedback de execução: a IA poderá consultar métricas de `V$SQL` para as instruções geradas e confirmar que o cursor sharing está funcionando como esperado, fechando o ciclo entre geração de código e comportamento em tempo de execução.

## Quando SQL dinâmico é genuinamente necessário

SQL dinâmico é ocasionalmente a ferramenta certa. Quando o nome da tabela é variável, quando a coluna do ORDER BY é selecionada pelo usuário em tempo de execução, quando uma cláusula WHERE precisa ser montada a partir de parâmetros de filtro opcionais — esses casos legitimamente requerem `EXECUTE IMMEDIATE` ou `DBMS_SQL`.

As regras nesses casos:
- Coloque literais no texto da instrução apenas quando representarem estrutura (nomes de tabelas, nomes de colunas, operadores). Esses não podem ser bind variables.
- Coloque valores na cláusula `USING` como bind variables, sempre. Todo valor de filtro, todo parâmetro, todo limiar.
- Evite `cursor_sharing = FORCE` como muleta. Essa opção mascara o problema sem resolvê-lo.

Um teste prático: se a única coisa que muda entre execuções é um valor (não um elemento estrutural), deve ser uma bind variable. Se esse valor estiver concatenado ao texto SQL, é um risco de corretude e um risco de performance.

## O estado real das coisas em 2026

Bind variables no Oracle são a resposta há trinta anos. A pergunta continua precisando ser feita porque a população de pessoas que escreve SQL continua mudando — novos desenvolvedores, geração de código assistida por IA, generalistas migrados do Postgres que não se depararam com o shared pool do Oracle porque o Postgres não tem um equivalente no mesmo sentido.

Uma ferramenta de IA que conhece Oracle especificamente — que conhece a diferença entre SQL estático e dinâmico em PL/SQL, que sabe quando `USING` é necessário, que sabe por que `cursor_sharing = FORCE` é um contorno e não uma solução — gerará código correto para Oracle de forma mais confiável do que uma ferramenta que trata Oracle como uma variante menor do SQL ANSI genérico.

Esse é o modelo sobre o qual o Veesker foi construído. Local-first, com grounding no schema, ciente da versão, com IA que sabe que o shared pool não é decoração.

Baixe o Veesker e escreva código Oracle que performa tão bem quanto compila: [veesker.cloud/download](/download).

— *Veesker*
