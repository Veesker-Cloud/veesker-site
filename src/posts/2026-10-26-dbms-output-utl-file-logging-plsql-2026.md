---
title: "DBMS_OUTPUT, UTL_FILE e padroes de logging para depuracao PL/SQL em 2026"
description: "DBMS_OUTPUT ainda funciona, UTL_FILE ainda roda, mas a forma de combinar os dois mudou. Um guia de campo para padroes de logging PL/SQL que sobrevivem em producao."
date: "2026-10-26"
slug: "dbms-output-utl-file-logging-plsql-2026"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "dbms-output", "utl-file"]
translation_slug: "dbms-output-utl-file-plsql-logging-2026"
read_minutes: 6
author: "claude-agent"
hero: "/datamap-hero.png"
---

Todo codebase PL/SQL tem a mesma confissao enterrada em algum lugar: uma linha que diz `DBMS_OUTPUT.PUT_LINE('aqui 1')`. As vezes tem um timestamp. Normalmente nao. Muitas vezes foi esquecida e nao faz absolutamente nada em producao porque nenhum cliente le o buffer.

Logging em PL/SQL e ao mesmo tempo resolvido e nao resolvido. As primitivas sao estaveis ha duas decadas. Os padroes para usa-las de forma adequada para producao estao espalhados por threads de forum, wikis internas e o conhecimento tacito dos DBAs que herdaram um codigo que nao escreveram. Este post reune os padroes que realmente funcionam.

## O que o DBMS_OUTPUT realmente e

DBMS_OUTPUT e um buffer no servidor, nao um stream. Quando voce chama `DBMS_OUTPUT.PUT_LINE`, a string vai para um buffer em memoria vinculado a sua sessao. Nada chega ao cliente ate que o bloco PL/SQL termine e o cliente chame `DBMS_OUTPUT.GET_LINES` (ou o antigo `GET_LINE`). SQL Developer, SQLcl e SQL*Plus fazem essa leitura automaticamente apos a execucao. Se a sua ferramenta nao o faz, voce nao ve nada.

As consequencias dessa arquitetura sao praticas.

O buffer e limitado. O padrao e 20.000 bytes. Voce define explicitamente com `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)` — ate um milhao de bytes, ou `NULL` para ilimitado. Se voce esta registrando dentro de um loop de dez mil iteracoes e esquece de definir um tamanho explicito, obtera `ORA-20000: ORU-10027: buffer overflow` no meio da execucao — o que aparece como um erro surpresa no meio de uma logica aparentemente diferente.

E com escopo de sessao. Um pacote executado via job do DBMS_SCHEDULER nao tem cliente vinculado. `DBMS_OUTPUT.PUT_LINE` dentro de um job agendado escreve em um buffer que nunca sera lido. A saida desaparece quando a sessao do job termina.

Nao tem timestamp, nivel de severidade nem informacao do chamador. Tudo e uma string. Isso e adequado para desenvolvimento interativo. Nao e adequado para depurar o que aconteceu em um job batch na terca-feira passada.

Nada disso torna o DBMS_OUTPUT inutil. E a ferramenta certa para trabalho interativo: escreva um bloco, execute, leia a saida. Para todo o restante, voce precisa de outra abordagem.

## UTL_FILE: persistente, mas com restricoes

UTL_FILE grava em arquivos no nível do sistema operacional via objetos de diretorio Oracle. O padrao basico:

```sql
DECLARE
  v_file UTL_FILE.FILE_TYPE;
BEGIN
  v_file := UTL_FILE.FOPEN(
    location     => 'LOG_DIR',         -- nome de objeto DIRECTORY, nao um caminho
    filename     => 'import_job.log',
    open_mode    => 'A',               -- append
    max_linesize => 32767
  );
  UTL_FILE.PUT_LINE(
    v_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3') || ' [INFO] iniciado'
  );
  UTL_FILE.FCLOSE(v_file);
END;
```

Dois pontos merecem destaque. O parametro `location` e um **nome de objeto de diretorio**, nao um caminho do sistema de arquivos. Se voce passar um caminho, ativa o comportamento legado `UTL_FILE_DIR` — um mecanismo pre-12c que exige reinicializacao do banco para configurar e esta desabilitado em muitos ambientes endurecidos. Use `CREATE DIRECTORY LOG_DIR AS '/opt/oracle/logs'` e conceda `READ, WRITE ON DIRECTORY` ao schema relevante.

O parametro `max_linesize` limita cada gravacao de linha individualmente, nao o arquivo inteiro. Se a mensagem de log ultrapassar `max_linesize`, Oracle levanta `VALUE_ERROR`. Defina como 32767 (o maximo) a menos que haja uma razao especifica para limitar.

UTL_FILE e a escolha certa quando voce precisa que o log sobreviva apos a sessao, ou quando esta executando um batch agendado e quer um arquivo que o DBA possa inspecionar diretamente. Sua fraqueza e operacional: ler esses arquivos de dentro do Oracle exige leituras via UTL_FILE ou uma tabela externa, e rotacionar ou arquivar e uma operacao no nivel do SO, fora do controle do banco.

## O padrao de tabela de log com transacoes autonomas

O destino de logging mais flexivel e uma tabela dedicada, gravada via transacao autonoma:

```sql
CREATE TABLE plsql_log (
  log_id     NUMBER GENERATED ALWAYS AS IDENTITY,
  log_ts     TIMESTAMP DEFAULT SYSTIMESTAMP,
  session_id NUMBER,
  module     VARCHAR2(64),
  severity   VARCHAR2(10),
  message    CLOB
);

CREATE OR REPLACE PROCEDURE log_msg(
  p_module   VARCHAR2,
  p_severity VARCHAR2,
  p_message  CLOB
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO plsql_log (session_id, module, severity, message)
  VALUES (SYS_CONTEXT('USERENV', 'SID'), p_module, p_severity, p_message);
  COMMIT;
END;
/
```

O `PRAGMA AUTONOMOUS_TRANSACTION` e o detalhe essencial. Sem ele, o insert de log participa da transacao do chamador. Se o procedimento chamador fizer rollback por ter encontrado um erro, a linha de log desaparece junto. Uma transacao autonoma faz commit independentemente, entao o registro de erro sobrevive ao rollback. E isso que torna o padrao util para depurar falhas, e nao apenas rastrear caminhos bem-sucedidos.

O `SYS_CONTEXT('USERENV', 'SID')` vincula cada linha a sessao que a gravou, o que importa quando multiplas sessoes executam o mesmo procedimento simultaneamente.

Um aprimoramento pratico: inclua o modulo e a acao do `DBMS_APPLICATION_INFO` na linha de log para poder correlacionar entradas com dados do AWR e `V$SESSION` sem joins adicionais.

## DBMS_APPLICATION_INFO: a primitiva subutilizada

`DBMS_APPLICATION_INFO` permite que o codigo em execucao reporte seu proprio contexto em `V$SESSION`. As tres chamadas principais:

```sql
DBMS_APPLICATION_INFO.SET_MODULE(
  module_name => 'BATCH_NOTURNO',
  action_name => 'CARREGANDO_PEDIDOS'
);
DBMS_APPLICATION_INFO.SET_CLIENT_INFO('passo 4 de 7');
```

Isso nao tem custo relevante. As strings aparecem imediatamente em `V$SESSION.MODULE`, `V$SESSION.ACTION` e `V$SESSION.CLIENT_INFO`. Um DBA monitorando uma sessao lenta consegue ver nao apenas que seu procedimento esta rodando, mas exatamente em qual parte dele esta.

A disciplina e chamar `SET_MODULE` no inicio de cada procedimento significativo e `SET_ACTION` em cada etapa logica. Ao final, redefina ambos para `NULL` ou para o contexto do chamador. Quando voce analisar dados do ASH para uma sessao que foi lenta na terca-feira passada, as colunas MODULE e ACTION mostram onde no codigo o tempo foi gasto — sem nenhuma instrumentacao adicional.

AWR e ASH agregam por modulo e acao. Se o seu batch critico e nomeado `BATCH_NOTURNO` de forma consistente, voce pode consultar o historico de tempo de execucao em `DBA_HIST_ACTIVE_SESS_HISTORY` sem conhecer os IDs de sessao antecipadamente e sem joins complicados.

## V$SESSION_LONGOPS para operacoes em massa

Se o seu procedimento processa um numero conhecido de linhas, reporte o progresso via `DBMS_APPLICATION_INFO.SET_SESSION_LONGOPS`. Isso alimenta `V$SESSION_LONGOPS`, que ferramentas de monitoramento exibem como indicador de progresso.

```sql
DECLARE
  v_rindex    BINARY_INTEGER := DBMS_APPLICATION_INFO.SET_SESSION_LONGOPS_NOHINT;
  v_slno      BINARY_INTEGER;
  v_totalwork NUMBER;
  v_sofar     NUMBER := 0;
BEGIN
  SELECT COUNT(*) INTO v_totalwork FROM pedidos_staging;

  FOR rec IN (SELECT pedido_id FROM pedidos_staging) LOOP
    -- processar rec
    v_sofar := v_sofar + 1;
    DBMS_APPLICATION_INFO.SET_SESSION_LONGOPS(
      rindex    => v_rindex,
      slno      => v_slno,
      op_name   => 'Carga staging de pedidos',
      sofar     => v_sofar,
      totalwork => v_totalwork,
      units     => 'linhas'
    );
  END LOOP;
END;
```

Passe `v_rindex` e `v_slno` de volta em cada chamada e o Oracle atualiza a linha existente em `V$SESSION_LONGOPS` em vez de inserir uma nova. A view continua legivel para queries de monitoramento executadas repetidamente durante a operacao.

## Combinando tudo em um codebase real

Um codebase PL/SQL de producao que lida com batches longos tipicamente combina todas essas camadas:

- `DBMS_APPLICATION_INFO` para rastreamento de modulo e acao — sempre, nao tem custo e e visivel no ASH
- `V$SESSION_LONGOPS` para progresso em operacoes em massa — quando o total de trabalho e conhecido antecipadamente
- Tabela de log com transacao autonoma para registros detalhados de eventos — substitui chamadas `DBMS_OUTPUT` em codigo agendado
- UTL_FILE como destino secundario quando o DBA precisa de um arquivo para arquivar ou entregar a um fornecedor

`DBMS_OUTPUT` mantem seu lugar no desenvolvimento interativo e na depuracao de blocos isolados, onde a execucao termina imediatamente e voce quer ver o rastro sem configurar nada.

O erro comum e usar `DBMS_OUTPUT` em todo lugar porque e o padrao, so para descobrir que metade do logging e invisivel em contextos de producao e a outra metade crasha com buffer overflow em datasets grandes. Os padroes acima evitam os dois problemas com codigo adicional minimo.

## Como o Veesker se encaixa

O Veesker expoe tudo isso sem configuracao extra. A saida do `DBMS_OUTPUT` de um bloco interativo e capturada e exibida junto com os resultados da query — sem precisar de `SET SERVEROUTPUT ON`. O explorador de sessoes mostra `MODULE`, `ACTION` e `CLIENT_INFO` em tempo real para cada sessao conectada. Rodando um procedimento que define `V$SESSION_LONGOPS`? O progresso aparece sem precisar escrever uma query de monitoramento manualmente.

O Veesker e local-first por design: a IDE desktop conecta diretamente a sua instancia Oracle, le o que a sessao reporta e exibe em um so lugar. A Community Edition e gratuita sob a licenca Apache 2.0 e funciona no Oracle 9i ate o 26ai.

Se seu time executa jobs no DBMS_SCHEDULER que atualmente fazem log via `DBMS_OUTPUT` e voce esta cansado de nao ver nada, o padrao de tabela de log acima e uma migracao de uma tarde. Comece por la, depois abra a tabela de log no grid de dados do Veesker para uma visao em tempo real do que executou.

**[Baixe o Veesker](/download)**

— *Veesker*
