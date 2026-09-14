---
title: "DBMS_OUTPUT, UTL_FILE e padroes de log em PL/SQL para 2026"
description: "Um guia pratico de depuracao e logging em PL/SQL: de DBMS_OUTPUT a tabelas de log estruturadas, DBMS_APPLICATION_INFO e captura de stack traces com FORMAT_ERROR_BACKTRACE."
date: "2026-09-14"
slug: "dbms-output-utl-file-padroes-log-plsql-2026"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "developer-tools"]
translation_slug: "dbms-output-utl-file-logging-plsql-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

PL/SQL nao tem um depurador no sentido do Python ou do Go: sem `pdb`, sem `dlv`, sem percorrer um loop em um terminal conectado ao processo em execucao. O que existe e um conjunto de pacotes nativos que registram, rastreiam e expoe estado desde a epoca do Oracle 7 — e um punhado de padroes que evoluiram ao redor deles. Em 2026, esses padroes ainda importam, e entender suas limitacoes e o primeiro passo para usa-los bem.

Este post cobre o conjunto basico — DBMS_OUTPUT, UTL_FILE e tabelas de log — e avanca para os cantos menos discutidos: DBMS_APPLICATION_INFO para visibilidade em tempo real da sessao, DBMS_UTILITY para stack traces proprios, e o padrao composto que se sustenta quando voce esta depurando um job agendado sem nenhuma sessao interativa.

## DBMS_OUTPUT: o cavalo de batalha com tres ressalvas

`DBMS_OUTPUT.PUT_LINE` e a primeira coisa que todo desenvolvedor Oracle aprende e a que recorre quando algo quebra. Esta sempre disponivel, nao exige privilegios alem da execucao do pacote e produz saida que aparece na janela do cliente sem nenhuma configuracao alem de habilitar o pacote.

A ressalva que pega mais gente de surpresa e que DBMS_OUTPUT e um buffer do lado do servidor. As linhas se acumulam nesse buffer durante a execucao; elas nao sao transmitidas ao cliente em tempo real. Se seu procedimento rodar por noventa segundos antes de lancar um erro, voce ve a saida somente depois que o erro aparece — ou nao ve nada, se a sessao for interrompida antes que o cliente descarregue o buffer.

A segunda ressalva e o limite do buffer. O maximo padrao e 20.000 linhas. Aumente no inicio de qualquer sessao longa:

```sql
EXEC DBMS_OUTPUT.ENABLE(buffer_size => NULL);
```

`NULL` remove o limite explicito. O Oracle impos um teto interno de cerca de um milhao de linhas, mas o modo de falha comum e atingir o padrao de 20.000 linhas no meio da execucao e receber `ORA-20000: ORU-10027: buffer overflow`. Definir como `NULL` no inicio da sessao nao tem custo e evita uma interrupcao frustrante.

A terceira ressalva e a disponibilidade. DBMS_OUTPUT e silenciosamente descartado quando nao ha sessao de cliente interativa — jobs agendados pelo DBMS_SCHEDULER nao produzem nenhuma saida visivel por esse pacote. Se voce esta depurando uma cadeia de jobs que roda as 2h da manha, DBMS_OUTPUT nao e a ferramenta certa.

## UTL_FILE: saida para o sistema de arquivos

Quando voce precisa de persistencia entre sessoes, ou de logging de jobs agendados onde DBMS_OUTPUT nao esta disponivel, `UTL_FILE` e a resposta padrao. O pacote permite que PL/SQL abra, escreva e feche arquivos de sistema operacional em diretorios pre-aprovados por um DBA com `CREATE OR REPLACE DIRECTORY`.

Um padrao minimo mas completo:

```sql
DECLARE
  fh UTL_FILE.FILE_TYPE;
BEGIN
  fh := UTL_FILE.FOPEN('LOG_DIR', 'migracao_20260914.log', 'A');
  UTL_FILE.PUT_LINE(fh,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3') || ' INFO  migracao iniciada'
  );

  -- ... trabalho ...

  UTL_FILE.PUT_LINE(fh,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
    || ' INFO  concluida, ' || v_row_count || ' linhas processadas'
  );
  UTL_FILE.FCLOSE(fh);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(fh) THEN
      UTL_FILE.PUT_LINE(fh,
        TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
        || ' ERROR ' || SQLERRM
      );
      UTL_FILE.FCLOSE(fh);
    END IF;
    RAISE;
END;
/
```

Dois pontos importantes. Primeiro, sempre feche o identificador de arquivo no bloco de excecao — um identificador nao fechado vaza um recurso do sistema operacional e pode impedir que outros processos leiam o arquivo ate que a sessao se desconecte. Segundo, a guarda `UTL_FILE.IS_OPEN` e necessaria porque o identificador pode nao ter sido aberto com sucesso se o erro ocorreu durante o proprio `FOPEN`.

O objeto de diretorio `LOG_DIR` deve mapear para um caminho real no sistema de arquivos com permissao de escrita para o usuario do processo Oracle. Em ambientes conteinerizados ou gerenciados na nuvem, os caminhos graváveis frequentemente se restringem a `/tmp` ou a um volume montado especifico; estabeleca isso antes de construir sua estrategia de logging com UTL_FILE.

UTL_FILE e a ferramenta certa para qualquer saida que precisa ser legivel por algo que nao seja Oracle — scripts de operacoes, ETL externo, monitoramento de operacoes. Nao e a ferramenta certa se voce quer que os dados de log sejam consultaveis via SQL.

## Tabelas de log: a camada consultavel

O padrao que escala mais no longo prazo e uma tabela de log dedicada. PL/SQL insere linhas nela usando uma transacao autonoma (`PRAGMA AUTONOMOUS_TRANSACTION`) para que as entradas de log sejam confirmadas independentemente da transacao externa. Essa autonomia e o ponto: uma migracao que faz rollback deve ainda deixar um rastro completo de log.

```sql
CREATE TABLE app_log (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  logged_at  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  session_id VARCHAR2(64),
  module     VARCHAR2(128),
  severity   VARCHAR2(10)  NOT NULL,
  message    CLOB,
  err_code   NUMBER,
  backtrace  CLOB
);

CREATE OR REPLACE PROCEDURE log_msg (
  p_severity IN VARCHAR2,
  p_module   IN VARCHAR2,
  p_message  IN VARCHAR2,
  p_err_code IN NUMBER   DEFAULT NULL,
  p_bt       IN VARCHAR2 DEFAULT NULL
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (session_id, module, severity, message, err_code, backtrace)
  VALUES (
    SYS_CONTEXT('USERENV', 'SID'),
    p_module,
    p_severity,
    p_message,
    p_err_code,
    p_bt
  );
  COMMIT;
END;
/
```

Um codigo chamador num handler de excecao faz entao:

```sql
EXCEPTION
  WHEN OTHERS THEN
    log_msg(
      p_severity => 'ERROR',
      p_module   => 'PKG_MIGRACAO.executar_fase',
      p_message  => SQLERRM,
      p_err_code => SQLCODE,
      p_bt       => DBMS_UTILITY.FORMAT_ERROR_BACKTRACE
    );
    RAISE;
END;
```

Esse ultimo parametro — `DBMS_UTILITY.FORMAT_ERROR_BACKTRACE` — merece um paragrafo proprio. Introduzido no Oracle 10g Release 2, ele retorna a pilha de chamadas completa no ponto em que a excecao foi originalmente lancada, nao no ponto em que foi capturada. A diferenca e enorme: sem ele, um handler generico no procedimento mais externo diz apenas que algo falhou no nivel superior. Com ele, voce ve que o erro se originou em `PKG_UTIL.parse_data` na linha 84, chamado de `PKG_MIGRACAO.validar_registro` na linha 211. Ainda e subutilizado em bases de codigo que existiam antes dessa funcionalidade.

## DBMS_APPLICATION_INFO: visibilidade em V$SESSION

Tudo ate agora escreve saida em algum lugar que voce le depois. `DBMS_APPLICATION_INFO` e diferente: ele escreve metadados na linha de sessao em `V$SESSION`, visivel em tempo real para qualquer DBA monitorando o banco de dados.

```sql
DBMS_APPLICATION_INFO.SET_MODULE(
  module_name => 'PKG_MIGRACAO',
  action_name => 'fase_3_validar'
);
DBMS_APPLICATION_INFO.SET_CLIENT_INFO('batch_id=20260914-001');
```

Um DBA monitorando um job de longa duracao pode consultar:

```sql
SELECT module, action, client_info,
       elapsed_time / 1000000 AS segundos_decorridos
FROM   v$session
WHERE  module LIKE 'PKG%';
```

Sem arquivo de log para acompanhar. Sem buffer para descarregar. A fase atual e o tempo decorrido estao ao vivo no dicionario de dados.

Defina o modulo no ponto de entrada de cada pacote e atualize a acao conforme avanca pelas fases. Redefina ambos para `NULL` ao sair com sucesso:

```sql
DBMS_APPLICATION_INFO.SET_MODULE(NULL, NULL);
```

Deixar strings obsoletas de modulo/acao na linha apos a conclusao da chamada e um descuido comum que torna o monitoramento baseado em V$SESSION enganoso — a sessao parece ainda estar rodando a fase 3 de uma migracao concluida ontem.

## Padrao composto para jobs agendados

Jobs do DBMS_SCHEDULER nao tem sessao interativa e nenhum buffer DBMS_OUTPUT visivel. Uma pilha de logging pratica para um job combina as tres camadas:

1. **DBMS_APPLICATION_INFO** na granularidade de modulo/acao — visivel ao vivo em V$SESSION sem conectar ao schema da aplicacao.
2. **Tabela de log com transacao autonoma** — confirmada por chamada de log, consultavel apos a execucao, sobrevive a um rollback da transacao externa.
3. **UTL_FILE** como escotilha de escape — um log em arquivo plano legivel no sistema de arquivos mesmo que o banco de dados esteja em estado degradado.

A camada UTL_FILE ganha seu lugar especificamente em cenarios de desastre: se voce nao consegue conectar para consultar `app_log`, o arquivo no sistema de arquivos ainda esta la.

Para jobs que processam grandes volumes, confirme checkpoints de progresso na tabela de log a cada limite de lote — a cada N linhas, a cada transicao de fase. Um job que travou as 3h e nao deixou checkpoints significa que voce esta adivinhando quanto trabalho foi realmente confirmado. Um job que registrou `450.000 de 1.200.000 linhas processadas` no ultimo checkpoint diz exatamente onde retomar.

## Aplicando a disciplina

Logging em PL/SQL e opcional de uma forma que nao e em codigo de camada de aplicacao. A maioria dos bancos de dados Oracle nao tem um framework que o force. Pacotes compilam e rodam sem nenhum logging.

A disciplina vem do pos-mortem: o job em lote que produziu resultados inconsistentes as 2h, a migracao que fez rollback por razoes que ninguem consegue reproduzir seis meses depois, o procedimento que rodou por seis horas e ninguem sabe o que estava fazendo nas primeiras quatro. Em cada um desses casos, o resultado e o mesmo: reconstruir a partir do estado que o banco de dados acontece de estar, porque nada foi escrito enquanto o codigo estava rodando.

Os padroes neste post nao sao novos. Eles sao anteriores a maior parte das ferramentas no ecossistema Oracle. Eles ainda sao a resposta correta em 2026 porque o problema de depuracao que resolvem nao mudou: o codigo roda em um servidor remoto, o desenvolvedor nao esta la quando falha, e algo precisa capturar o que aconteceu com fidelidade suficiente para diagnosticar depois.

Construa a camada de logging antes de precisar dela. Adicione a chamada `FORMAT_ERROR_BACKTRACE` ao seu template padrao de handler de excecao. Defina `DBMS_APPLICATION_INFO` no inicio de cada ponto de entrada que roda tempo suficiente para importar.

Quando o incidente das 2h chegar, voce quer que o log ja esteja la.

---

[Baixe o Veesker](/download) para instrumentar e depurar seus pacotes PL/SQL em uma IDE Oracle local-first com integracao nativa ao DBMS_OUTPUT. A Community Edition e gratuita sob Apache 2.0 — sem telemetria, sem credenciais saindo do desktop.

— *Veesker*
