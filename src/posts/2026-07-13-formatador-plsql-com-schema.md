---
title: "Escrevendo um formatador PL/SQL com reconhecimento de schema: regras que um linter genérico não consegue"
description: "Formatadores SQL genéricos trabalham com sintaxe. Decisões de formatação em PL/SQL são frequentemente semânticas — e a resposta certa está no banco, não no código-fonte."
date: "2026-07-13"
slug: "formatador-plsql-com-schema"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "formatador", "ferramentas-desenvolvedor", "linter"]
translation_slug: "schema-aware-plsql-formatter"
read_minutes: 6
author: "claude-agent"
hero: "/datamap-hero.png"
---

Formatadores SQL genéricos operam sobre sintaxe. Eles analisam um fluxo de tokens, aplicam regras de indentação, normalizam o uso de maiúsculas e emitem o resultado. Para a maioria dos dialetos SQL isso funciona bem na maior parte do tempo. Para PL/SQL não é suficiente — porque decisões de formatação que parecem escolhas de estilo são frequentemente escolhas semânticas, e a resposta certa depende de informações que estão no banco de dados, não no código-fonte.

Este post aborda a classe de regras que exigem conhecimento do schema para serem aplicadas corretamente, e como o formatador do Veesker integra metadados da conexão ativa para tratá-las.

## Onde os formatadores genéricos param de funcionar

Comece pelo uso de maiúsculas em identificadores. Um formatador genérico tem duas opções: colocar tudo em maiúsculas, tudo em minúsculas ou manter como está. Cada escolha é internamente consistente e sintaticamente segura. Nenhuma delas é semanticamente consistente com uma base de código onde o DBA nomeou uma tabela como `Customer_Account` em maiúsculas mistas e o código da aplicação acumulou dez anos de `CUSTOMER_ACCOUNT`, `customer_account` e `Customer_Account` espalhados por quinhentos procedimentos.

Identificadores Oracle sem aspas são insensíveis a maiúsculas, então o banco não se importa. Os humanos que mantêm o código, sim. Um formatador que normaliza tudo para maiúsculas está fazendo uma escolha que pode contradizer a convenção de nomenclatura real da equipe sem que nenhuma das partes perceba. Um formatador com reconhecimento de schema pode ler os nomes dos objetos de `ALL_OBJECTS` ou `USER_OBJECTS` e normalizar as referências para corresponder — ou pelo menos sinalizar inconsistências.

A formatação de hints é um exemplo ainda mais claro:

```sql
SELECT /*+ INDEX(e EMP_IDX_DEPT_HIRE) PARALLEL(e, 4) */
       e.employee_id,
       e.hire_date
FROM   employees e
WHERE  e.department_id = :dept_id;
```

Um formatador genérico não tem como saber se `EMP_IDX_DEPT_HIRE` é um índice real. Ele pode reformatar o hint, remover o comentário dependendo de como o parser trata hints, ou deixar passar intacto. O que ele não consegue fazer é informar que o índice foi renomeado para `EMP_DEPT_HIRE_IDX` no trimestre passado durante uma manutenção do DBA, então seu hint agora é silenciosamente ignorado pelo otimizador.

Reconhecimento de schema significa ler `ALL_INDEXES` e cruzar o conteúdo do hint com os nomes reais dos índices nas tabelas em escopo. Isso não é formatação como estilo — é formatação como correção.

## Regras estruturais específicas do PL/SQL

Além dos metadados do banco, o PL/SQL tem construções estruturais que parsers SQL genéricos tratam mal ou ignoram. Um formatador que não fala PL/SQL como linguagem de primeira classe produz saída que compila, mas parece ter sido formatada por uma ferramenta que não entende o que está processando.

**Alinhamento de spec e body de package.** A spec declara; o body define. Um formatador que trata os dois como blocos SQL independentes vai ignorar o emparelhamento e produzir indentação inconsistente entre a declaração de um procedure na spec e sua implementação no body. O formatador precisa entender a estrutura de dois arquivos e aplicar regras consistentes entre eles.

**FORALL e BULK COLLECT.** Não são loops `FOR` com uma palavra-chave diferente. Têm características de desempenho distintas, tratamento de exceções diferente via `SAVE EXCEPTIONS`, e restrições diferentes sobre os tipos de coleção que operam. Formatá-los de forma idêntica a um cursor FOR loop distorce o que o código faz.

```sql
-- cursor FOR loop: linha por linha, semântica de cursor direta
FOR r IN (SELECT * FROM orders WHERE status = 'P') LOOP
  process_order(r.order_id);
END LOOP;

-- BULK COLLECT + FORALL: baseado em conjuntos, perfil de desempenho muito diferente
SELECT *
BULK COLLECT INTO l_orders
FROM orders
WHERE status = 'P';

FORALL i IN 1..l_orders.COUNT
  INSERT INTO order_archive VALUES l_orders(i);
```

Um formatador genérico que vê `FORALL` e `FOR` como a mesma construção de loop vai formatar o corpo do FORALL como se contivesse instruções procedurais. A regra de formatação para FORALL é que o corpo é um único comando DML — sem `BEGIN`/`END`, sem ponto-e-vírgula dentro do limite. Errar isso não quebra a compilação, mas produz código que parece escrito por alguém que nunca usou `FORALL`.

**CONNECT BY e consultas hierárquicas.** A ordem das cláusulas em uma consulta hierárquica tem peso semântico:

```sql
SELECT employee_id,
       LEVEL,
       SYS_CONNECT_BY_PATH(last_name, '/') AS path
FROM   employees
START WITH manager_id IS NULL
CONNECT BY PRIOR employee_id = manager_id
ORDER SIBLINGS BY last_name;
```

`ORDER SIBLINGS BY` não é o mesmo que `ORDER BY` em uma consulta hierárquica. `START WITH` deve preceder `CONNECT BY`. Um formatador que reordena cláusulas aplicando regras genéricas de precedência SQL vai produzir saída que ou não faz parse ou muda o comportamento silenciosamente.

## Regras com reconhecimento de schema na prática

Com uma conexão ativa, o formatador pode fazer coisas impossíveis a partir do texto-fonte.

**Referências de coluna ambíguas.** Procedimentos PL/SQL frequentemente referenciam colunas sem qualificar com alias de tabela, especialmente em cláusulas `WHERE` e listas `UPDATE SET`. Quando duas tabelas de um join compartilham o nome de uma coluna, o Oracle resolve a referência por regras de precedência que não são óbvias ao ler o código. Um formatador com reconhecimento de schema pode ler os metadados de coluna das tabelas em escopo e sinalizar referências ambíguas:

```sql
-- 'status' existe tanto em orders quanto em order_lines — qual delas?
UPDATE orders o
   SET status = 'C'   -- é o.status, mas um leitor não consegue determinar isso
 WHERE o.order_id IN (
   SELECT ol.order_id
     FROM order_lines ol
    WHERE ol.line_type = 'P'
 );
```

**Avisos de bind variable com consciência de tipo.** O otimizador do Oracle trata bind variables numéricas e de texto de forma diferente ao montar planos de execução. Um formatador que entende os tipos de coluna de `ALL_TAB_COLUMNS` pode sinalizar casos onde uma bind variable do tipo errado pode forçar uma conversão implícita e suprimir o uso de índice:

```sql
-- department_id é NUMBER; uma bind VARCHAR2 aqui força conversão implícita
WHERE e.department_id = :dept_id
```

Isso é mais uma verificação de linter do que uma regra de formatação, mas a informação vem da mesma leitura de schema, e surfacear no momento da formatação é a hora certa — antes da consulta chegar ao otimizador e o plano de execução degradar silenciosamente.

**Conteúdo de SQL dinâmico.** `EXECUTE IMMEDIATE` com literais de string concatenados é um sinal de alerta para SQL injection, e também às vezes inevitável em DDL que não pode usar bind variables. Um formatador com reconhecimento de schema pode ler o conteúdo da string e determinar se contém um `SELECT`, um comando DML ou DDL — e formatar o SQL embutido de forma consistente:

```sql
EXECUTE IMMEDIATE
  'ALTER TABLE ' || p_table_name || ' ENABLE ROW MOVEMENT';
```

Formatar o comando embutido de forma consistente, mesmo dentro de um literal de string, torna o código auditável. Um formatador que ignora o conteúdo do SQL dinâmico produz blocos opacos onde o comando real é invisível para análise estática.

## As regras que um linter genérico não consegue expressar

Uma forma útil de caracterizar a diferença: linters genéricos trabalham com tokens e regras gramaticais. As regras acima exigem joins contra o catálogo do banco de dados. São consultas contra `ALL_OBJECTS`, `ALL_TAB_COLUMNS`, `ALL_INDEXES`, `ALL_PROCEDURES` e views relacionadas — views que guardam o contexto semântico que o texto-fonte não carrega.

Isso não é uma crítica a linters genéricos. SQLFluff, pgFormatter e ferramentas similares fazem a coisa certa para a superfície que atingem. A superfície PL/SQL do Oracle — com sua arquitetura de hints, variantes de sintaxe sensíveis à versão do 9i ao 26ai, convenções de emparelhamento de packages, tipos registrados no catálogo e object tables — é um problema diferente.

O formatador que a cobre completamente não é um formatador SQL com um plugin Oracle. É um formatador construído tendo o catálogo Oracle como fonte de dados de primeira classe.

## Como o Veesker trata isso

O formatador do Veesker roda contra os metadados da conexão ativa. Ao formatar um procedimento, o formatador lê as definições de objetos relevantes de `ALL_OBJECTS`, `ALL_TAB_COLUMNS`, `ALL_INDEXES` e `ALL_PROCEDURES` para as tabelas e packages em escopo. Essa leitura é cacheada por sessão, então a segunda formatação do mesmo procedimento é rápida.

As regras que exigem conhecimento de schema são apresentadas como anotações, não como reescritas automáticas. Você vê a sugestão e decide se quer aplicá-la. O objetivo é um formatador que informa sem impor.

O formatador faz parte da Community Edition — Apache 2.0, funciona totalmente offline, sem telemetria. A camada Cloud (prevista para H2 2026) vai ampliar com perfis de regras de formatação compartilhados por equipe e detecção de drift de schema entre ambientes. O Veesker não acessa servidores externos para aplicar essas regras: a leitura de schema é uma consulta local contra a instância Oracle conectada, igual a qualquer consulta que você executa no editor.

Um formatador SQL genérico é uma ferramenta útil. Um formatador PL/SQL com reconhecimento de schema é uma ferramenta diferente, e essa diferença não é cosmética.

Baixe o Veesker e formate seu primeiro package PL/SQL contra um schema real: [veesker.cloud/download](/download).

— *Veesker*
