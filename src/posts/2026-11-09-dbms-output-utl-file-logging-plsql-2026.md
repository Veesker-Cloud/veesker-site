---
title: "DBMS_OUTPUT, UTL_FILE e Padrões de Logging para Depuração PL/SQL em 2026"
description: "DBMS_OUTPUT não é uma estratégia de logging para produção. Veja como tabelas com transação autônoma, UTL_FILE e DBMS_APPLICATION_INFO se encaixam na depuração Oracle real."
date: "2026-11-09"
slug: "dbms-output-utl-file-logging-plsql-2026"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "developer-tools"]
translation_slug: "dbms-output-utl-file-plsql-logging-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Todo desenvolvedor PL/SQL já escreveu `DBMS_OUTPUT.PUT_LINE` em algum momento. É o comando de debug print do Oracle — rápido de usar, honesto em suas limitações. O problema é que muitas bases de código nunca evoluem além disso. Packages com vinte anos ainda roteiam informações de erro por um buffer que desaparece quando a sessão termina, para um cliente que pode ou não estar ouvindo, em um formato que torna a análise estruturada impossível.

O logging em PL/SQL tem opções melhores. Este post mapeia o cenário em 2026: para que o DBMS_OUTPUT realmente serve, onde o UTL_FILE ajuda e onde ele complica as coisas, como tabelas de log com transação autônoma se tornaram o padrão em produção, e o que o DBMS_APPLICATION_INFO adiciona em termos de observabilidade — algo que desenvolvedores consistentemente ignoram.

## DBMS_OUTPUT: sendo honesto sobre o que ele é

DBMS_OUTPUT é um buffer de sessão. Quando você chama `PUT_LINE`, a string vai para um buffer (configurável em até um milhão de linhas desde o Oracle 10g). Seu cliente — SQL*Plus, uma IDE, qualquer cliente JDBC que chame `DBMS_OUTPUT.GET_LINES` — drena esse buffer após a execução do statement.

Três aspectos dessa arquitetura importam na prática.

**O buffer não é visível durante a execução.** Você não consegue acompanhar a saída em tempo real, a menos que seu cliente faça polling de `GET_LINES` em uma thread de fundo durante a sessão. A maioria das IDEs não faz isso. Se um procedure roda por dez minutos, você não vê nada até ele terminar.

**O buffer tem escopo de sessão.** Se um stored procedure é executado dentro de um job do DBMS_SCHEDULER ou de um consumidor do Oracle Advanced Queuing, não há cliente conectado. O buffer enche, a sessão termina, o output some. Usar DBMS_OUTPUT para depurar jobs agendados é uma fonte persistente de confusão.

**Não há severidade nem estrutura.** Cada chamada produz uma string simples. Análise pós-incidente significa fazer grep em um dump de texto — se você capturou um.

Para que o DBMS_OUTPUT realmente serve: desenvolvimento interativo. Quando você está escrevendo um package e executando-o manualmente em uma sessão IDE, PUT_LINE é a ferramenta certa — barato, sem configuração, sem rastro de auditoria. Quando você passa para depuração em produção, diagnóstico de jobs em batch, ou qualquer situação em que o erro possa acontecer sem um humano observando, é preciso outra solução.

## UTL_FILE: quando você quer persistência mas não uma tabela

UTL_FILE escreve diretamente no sistema de arquivos do servidor Oracle. O padrão clássico:

```sql
DECLARE
  v_fh  UTL_FILE.FILE_TYPE;
BEGIN
  v_fh := UTL_FILE.FOPEN('LOG_DIR', 'debug_' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '.log', 'A');
  UTL_FILE.PUT_LINE(v_fh, TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') || ' — etapa concluída');
  UTL_FILE.FCLOSE(v_fh);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(v_fh) THEN UTL_FILE.FCLOSE(v_fh); END IF;
    RAISE;
END;
```

Isso requer um objeto DIRECTORY apontando para um caminho no servidor, e privilégio EXECUTE sobre UTL_FILE. O DBA controla quais caminhos são acessíveis — em muitos ambientes, o acesso é restrito ou o caminho está em um mount que a equipe de desenvolvimento não consegue ler.

UTL_FILE é genuinamente útil em duas situações: pipelines de extração em batch onde a saída precisa ser um arquivo texto para um consumidor downstream, e trilhas de auditoria procedural que precisam sobreviver a um `ROLLBACK` do banco de dados por estarem fora do mecanismo transacional.

A limitação está exatamente nessa localização no sistema de arquivos. Você não consegue consultar um log do UTL_FILE com SQL. Não consegue cruzar entradas de log com as linhas que causaram o erro. Não consegue alertar sobre padrões nas entradas sem escrever um pipeline de ingestão separado. Para fins de depuração, uma tabela é quase sempre o destino mais adequado.

## Tabelas de log com transação autônoma: o padrão em produção

O padrão de logging para PL/SQL que é implantado em produção tem esta forma:

```sql
CREATE TABLE plsql_log (
  id          NUMBER GENERATED ALWAYS AS IDENTITY,
  logged_at   TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  module      VARCHAR2(64),
  action      VARCHAR2(64),
  severity    VARCHAR2(10) CHECK (severity IN ('DEBUG','INFO','WARN','ERROR')),
  message     CLOB,
  session_id  NUMBER DEFAULT SYS_CONTEXT('USERENV','SESSIONID')
);
```

O detalhe crítico de implementação é o **pragma de transação autônoma**:

```sql
CREATE OR REPLACE PROCEDURE log_event (
  p_module   IN VARCHAR2,
  p_action   IN VARCHAR2,
  p_severity IN VARCHAR2,
  p_message  IN CLOB
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO plsql_log (module, action, severity, message)
  VALUES (p_module, p_action, p_severity, p_message);
  COMMIT;
END;
```

A transação autônoma faz com que o insert no log seja commitado independentemente da transação chamadora. Se seu procedure principal está no meio de atualizar mil linhas e encontra um erro, o `ROLLBACK` subsequente não apaga as entradas de log. Esse é exatamente o motivo pelo qual o pragma é necessário — sem ele, o diagnóstico de erro desaparece no pior momento possível.

Dois padrões surgem repetidamente assim que essa estrutura está em vigor.

**Registre o error stack completo do Oracle, não apenas SQLERRM.** `DBMS_UTILITY.FORMAT_ERROR_BACKTRACE` retorna a pilha de chamadas PL/SQL no ponto da exceção, incluindo package e número de linha. `DBMS_UTILITY.FORMAT_ERROR_STACK` inclui a cadeia de erros completa para exceções aninhadas. Registrar ambos juntos torna a análise pós-incidente genuinamente viável:

```sql
EXCEPTION
  WHEN OTHERS THEN
    log_event(
      'ORDERS_PKG', 'process_order', 'ERROR',
      DBMS_UTILITY.FORMAT_ERROR_STACK || CHR(10) ||
      DBMS_UTILITY.FORMAT_ERROR_BACKTRACE
    );
    RAISE;
END;
```

**Use SYS_CONTEXT para capturar a identidade da sessão automaticamente.** `SYS_CONTEXT('USERENV', 'OS_USER')`, `SESSION_USER` e `CLIENT_INFO` fornecem contexto completo sobre quem executou o quê, sem exigir que cada call site passe isso como parâmetro. Adicione uma expressão default à tabela ou popule uma vez no início da sessão, e todos os inserts subsequentes carregam essas informações.

## DBMS_APPLICATION_INFO: a metade esquecida

DBMS_APPLICATION_INFO é um mecanismo de baixo overhead que define metadados visíveis na sessão Oracle atual — metadados que aparecem em V$SESSION e V$SQL. Ele não escreve em nenhuma tabela e praticamente não adiciona overhead.

```sql
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE(
    module_name => 'PAYROLL_PKG',
    action_name => 'calculate_period'
  );
  -- ... trabalho principal ...
  DBMS_APPLICATION_INFO.SET_ACTION('post_adjustments');
  -- ...
END;
```

O valor disso em 2026 é visibilidade operacional sem mudanças no código de monitoramento. Qualquer DBA observando `V$SESSION` durante um incidente de performance consegue imediatamente ver qual package e action está em execução. Se você tem o Diagnostic Pack licenciado, os rótulos de módulo e action também aparecem nos relatórios AWR junto com estatísticas de query, permitindo correlacionar queries lentas com seu contexto de chamada diretamente.

O padrão que funciona melhor é um wrapper que chama ambos: `log_event` para o registro persistente na tabela de log, e `SET_MODULE`/`SET_ACTION` para a visibilidade em tempo real da sessão. Eles servem a audiências diferentes — o DBA de operações monitorando um sistema em execução versus o desenvolvedor lendo uma tabela de log dois dias depois — e o overhead de manter ambos é algumas linhas extras de código wrapper.

## O que o Veesker adiciona a esse fluxo

A janela de query do Veesker lida com DBMS_OUTPUT sem cerimônia: executar um bloco PL/SQL drena o buffer e exibe a saída inline, sem um preâmbulo de `SET SERVEROUTPUT ON`. Para contextos onde DBMS_OUTPUT não vai a lugar nenhum — jobs agendados, procedures em background — a IDE observa isso e o assistente de AI pode sugerir o padrão de tabela de log quando você descreve o que está tentando capturar.

O schema browser exibe sua tabela `plsql_log` junto com as definições dos seus packages. Consultar logs de erro na mesma sessão em que você está editando o package que os produziu é simples. O assistente de AI, fundamentado no seu schema real, consegue ler as definições de coluna da sua tabela de log e sugerir ajustes: adicionar uma coluna de correlation ID, trocar um VARCHAR2 por CLOB, reestruturar o índice para um padrão de query por intervalo de tempo.

As funcionalidades de AI gerenciada — análise de logs entre sessões, detecção de anomalias na distribuição de severidade — fazem parte do tier Cloud que chega no H2 2026.

## Uma configuração que realmente funciona

Para PL/SQL em produção, a configuração mínima viável de logging em 2026 é:

1. Uma tabela de log com transação autônoma, com níveis de severidade, timestamps, colunas de módulo/action e armazenamento CLOB para a mensagem.
2. Um procedure `log_event` que captura `FORMAT_ERROR_STACK` e `FORMAT_ERROR_BACKTRACE` nos handlers de exceção.
3. Chamadas a `DBMS_APPLICATION_INFO.SET_MODULE` e `SET_ACTION` nos pontos de entrada dos procedures, para que sessões ativas sejam legíveis em V$SESSION.
4. DBMS_OUTPUT reservado apenas para desenvolvimento interativo — não para jobs agendados, não para exceções em produção.
5. UTL_FILE para pipelines de extração onde o sistema downstream espera um arquivo, não uma linha de tabela.

DBMS_OUTPUT não vai desaparecer. É o debug print statement do Oracle há trinta anos e vai continuar existindo no 26ai. A questão é se ele é a ferramenta certa para o diagnóstico que você está tentando resolver — e na maioria dos cenários de produção, não é.

---

Baixe o Veesker e explore sua configuração de logging PL/SQL com ferramentas cientes do schema: [veesker.cloud/download](/download).

— *Veesker*
