---
title: "DBMS_OUTPUT, UTL_FILE e padroes de logging para depuracao de PL/SQL em 2026"
description: "Um guia pratico para logging em PL/SQL: quando DBMS_OUTPUT e suficiente, quando UTL_FILE e melhor e como construir um framework de log que sobrevive em producao."
date: "2026-10-05"
slug: "dbms-output-utl-file-log-plsql-2026"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "developer-tools"]
translation_slug: "dbms-output-utl-file-plsql-logging-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

O PL/SQL tem `DBMS_OUTPUT` desde o Oracle 7. O mecanismo e simples: sua procedure chama `DBMS_OUTPUT.PUT_LINE`, o Oracle armazena o texto em um buffer e o cliente drena esse buffer apos a execucao ser concluida. Funciona. Tambem e uma ferramenta de depuracao que se torna um problema assim que o codigo sai de uma janela SQL no laptop e vai para um job agendado, um slave de consulta paralela ou um package executado dentro de uma trigger.

Em 2026, a maioria dos ambientes Oracle ainda tem codigo de producao que faz log em `DBMS_OUTPUT`, e desenvolvedores que aprenderam a depurar com ele porque ninguem lhes apresentou uma opcao melhor. Este post trata das alternativas, de quando cada uma se justifica e de como a escolha feita durante o desenvolvimento define o que e possivel enxergar em producao.

## O que DBMS_OUTPUT realmente e

`DBMS_OUTPUT` e um ring buffer no lado do servidor. Quando a sessao chama `PUT_LINE`, o Oracle acrescenta o texto a um buffer em memoria associado aquela sessao. O buffer nao e descarregado em tempo real. Nao e gravado em nenhum arquivo. Nao e visivel para nenhuma outra sessao. O cliente -- SQL*Plus, SQL Developer, Veesker ou qualquer driver que chame `DBMS_OUTPUT.GET_LINES` apos a execucao -- recupera o texto acumulado somente depois que a chamada de nivel superior retorna.

As consequencias praticas:

**O buffer tem limite.** O padrao e 20.000 bytes. E possivel aumentar com `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)`, mas o teto e 1.048.576 bytes (1 MB) na maioria das versoes do Oracle. Um job de longa execucao que produz mais saida do que o buffer suporta vai truncar os dados ou lancar `ORA-20000`, dependendo de como a sessao foi habilitada.

**Timing e invisivel.** Como o cliente so ve a saida depois que a execucao termina, nao e possivel acompanhar o progresso em tempo real. Uma procedure que roda por quatro minutos gera quatro minutos de silencio seguidos de uma enxurrada de texto. Se a procedure travar no terceiro minuto, pode-se obter saida parcial ou nada.

**Jobs nao enxergam nada.** Um job do DBMS_SCHEDULER roda em uma sessao de background. Nenhum cliente interativo esta drenando o buffer `DBMS_OUTPUT`. Toda chamada a `PUT_LINE` em um job agendado e silenciosamente descartada.

**Execucao paralela perde a saida.** Quando o Oracle distribui uma consulta para slaves de processamento paralelo, cada slave tem sua propria sessao. As mensagens de `DBMS_OUTPUT` dos slaves nunca chegam a sessao coordenadora.

Para desenvolvimento interativo e scripts ad-hoc, `DBMS_OUTPUT` e perfeitamente adequado. Para qualquer coisa que rode sem supervisao humana, nao e um mecanismo de logging.

## UTL_FILE: persistente, mas nao sem complicacoes

`UTL_FILE` grava em arquivos do sistema operacional atraves do processo servidor do Oracle. Esta disponivel desde o Oracle 7.3 e continua sendo a maneira padrao de produzir logs baseados em arquivo a partir do PL/SQL.

A configuracao exige um objeto de diretorio:

```sql
CREATE OR REPLACE DIRECTORY app_log_dir AS '/u01/app/logs';
GRANT READ, WRITE ON DIRECTORY app_log_dir TO app_user;
```

Uma procedure minima de log fica assim:

```plsql
PROCEDURE write_log(p_message IN VARCHAR2) IS
  v_file UTL_FILE.FILE_TYPE;
BEGIN
  v_file := UTL_FILE.FOPEN(
    location     => 'APP_LOG_DIR',
    filename     => 'app_' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '.log',
    open_mode    => 'A',
    max_linesize => 32767
  );
  UTL_FILE.PUT_LINE(v_file, TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
    || ' [' || SYS_CONTEXT('USERENV', 'SESSION_USER') || '] '
    || p_message);
  UTL_FILE.FCLOSE(v_file);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(v_file) THEN
      UTL_FILE.FCLOSE(v_file);
    END IF;
END;
```

O padrao de abrir-gravar-fechar dentro de uma unica chamada e intencional. Manter um handle de arquivo aberto entre limites de procedure e caminhos de excecao e uma maneira confiavel de vazar file handles. O Oracle limita o numero de handles abertos por sessao, e o erro resultante -- `UTL_FILE.INVALID_OPERATION` -- nao deixa clara a causa.

`UTL_FILE` oferece timestamps reais, persiste apos falhas (tudo gravado antes do crash fica no disco) e funciona em jobs de background. As contrapartidas sao operacionais: rotacao de log e problema seu, permissoes de diretorio sao problema seu, e o arquivo fica no sistema de arquivos do servidor Oracle, que pode nao ser onde sua ferramenta de agregacao de logs esta monitorando.

## DBMS_APPLICATION_INFO: a opcao subutilizada

`DBMS_APPLICATION_INFO` nao grava nenhum registro persistente. O que faz e atualizar as colunas `MODULE`, `ACTION` e `CLIENT_INFO` de `V$SESSION` em tempo real. Qualquer DBA com acesso a essa view pode ver o que sua sessao esta fazendo agora.

```plsql
PROCEDURE process_batch(p_batch_id IN NUMBER) IS
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE(
    module_name => 'BATCH_PROCESSOR',
    action_name => 'CARREGANDO'
  );
  -- fase de carga ...

  DBMS_APPLICATION_INFO.SET_ACTION('VALIDANDO');
  -- fase de validacao ...

  DBMS_APPLICATION_INFO.SET_ACTION('COMMITANDO');
  COMMIT;

  DBMS_APPLICATION_INFO.SET_MODULE(NULL, NULL);
END;
```

`V$SESSION` tambem e a fonte para amostragem do AWR e do ASH. Um job de longa execucao que preenche `MODULE` e `ACTION` corretamente aparecera nos relatorios de analise de wait segmentados por esses rotulos. Isso vale mais do que um arquivo de log para investigacoes de desempenho.

## Tabelas de log: o padrao de producao

Para qualquer coisa que precise sobreviver entre sessoes, ser consultavel ou alimentar um sistema de alertas, uma tabela de log e a resposta certa.

```sql
CREATE TABLE app_log (
  log_id      NUMBER         GENERATED ALWAYS AS IDENTITY,
  log_ts      TIMESTAMP(6)   DEFAULT SYSTIMESTAMP NOT NULL,
  log_level   VARCHAR2(10)   NOT NULL,
  module_name VARCHAR2(100),
  message     VARCHAR2(4000),
  session_id  NUMBER         DEFAULT SYS_CONTEXT('USERENV', 'SESSIONID'),
  CONSTRAINT app_log_pk PRIMARY KEY (log_id)
) COMPRESS FOR OLTP;
```

A decisao critica de design e a estrategia de commit. Se a procedure de log fizer commit apos cada insert, ela interferira no comportamento de rollback da transacao chamadora. Se a transacao chamadora fizer rollback por erro, todos os registros de log daquela transacao desaparecem -- incluindo o que teria dito o que falhou.

A solucao padrao e uma transacao autonoma:

```plsql
PROCEDURE log_event(
  p_level   IN VARCHAR2,
  p_module  IN VARCHAR2,
  p_message IN VARCHAR2
) IS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (log_level, module_name, message)
  VALUES (p_level, p_module, p_message);
  COMMIT;
END;
```

O `PRAGMA AUTONOMOUS_TRANSACTION` faz o insert de log rodar em seu proprio contexto de transacao separado. Ele faz commit de forma independente, entao um rollback no codigo chamador nao apaga a entrada de log. A propria procedure nao consegue ver os dados nao confirmados da transacao chamadora -- o que quase sempre e o comportamento correto para um log: registrar que algo aconteceu, nao ler de volta o estado que estava sendo modificado.

## Combinando os padroes

As abordagens nao sao mutuamente exclusivas. Um padrao pratico para um processo batch complexo:

- Usar `DBMS_APPLICATION_INFO` ao longo de todo o processo para que a fase atual seja sempre visivel em `V$SESSION`.
- Registrar os principais eventos do ciclo de vida (inicio, fim, erro) na tabela de log via uma procedure com transacao autonoma.
- Usar `DBMS_OUTPUT.PUT_LINE` para diagnosticos em tempo de desenvolvimento, atras de uma condicional: `IF g_debug THEN DBMS_OUTPUT.PUT_LINE(...); END IF;`
- Gravar em `UTL_FILE` apenas quando a saida for destinada a ser consumida por um processo externo em vez de por um humano ou uma consulta de monitoramento.

O flag condicional `g_debug` permite deixar a instrumentacao no codigo de producao sem pagar pela alocacao do buffer em cada chamada. Defina-o por meio de uma variavel no nivel do package com valor padrao `FALSE`, que pode ser ativada em uma sessao sem recompilar.

## O que o Veesker acrescenta aqui

O painel de saida do Veesker drena o `DBMS_OUTPUT` em tempo real durante a execucao interativa -- ele chama `DBMS_OUTPUT.GET_LINES` em um intervalo curto de polling enquanto sua instrucao roda, para que voce veja a saida conforme ela e produzida, e nao somente apos o retorno da instrucao. Para desenvolvimento e scripts ad-hoc, isso muda a experiencia de "rodar e esperar" para algo mais proximo de um tail ao vivo.

Para a saida da tabela de log, o Veesker permite manter uma consulta com atualizacao automatica em um painel dividido ao lado da procedure que esta sendo depurada. O navegador de esquemas resolve `app_log` (ou qualquer que seja o nome da tabela) a partir do esquema conectado automaticamente.

A camada de IA, quando usada para reescrita de PL/SQL, preserva chamadas a `PRAGMA AUTONOMOUS_TRANSACTION` e `DBMS_APPLICATION_INFO` encontradas no codigo-fonte. Ferramentas genericas tendem a remover essas chamadas como "ruido" por nao entenderem o que fazem. O parser PL/SQL do Veesker sabe o que sao.

## O formato de uma configuracao de log sustentavel

O que o acima resulta em: uma tabela de log com um wrapper de transacao autonoma, `DBMS_APPLICATION_INFO` em toda procedure significativa que possa aparecer no AWR ou ASH, `DBMS_OUTPUT` atras de um flag de debug para desenvolvimento interativo, e `UTL_FILE` reservado para casos em que um consumidor de arquivo externo e o requisito real.

Nao e uma arquitetura complexa. E um conjunto de decisoes tomadas uma vez e aplicadas de forma consistente -- e e a diferenca entre "nao faco ideia do que esse job estava fazendo quando falhou as 03:00" e "tenho uma linha com timestamp em `APP_LOG` e uma entrada AWR correspondente para o wait que a precedeu."

Baixe o Veesker e trabalhe nos seus packages PL/SQL existentes com uma IDE que entende o que esta lendo: [veesker.cloud/download](/download).

— *Veesker*
