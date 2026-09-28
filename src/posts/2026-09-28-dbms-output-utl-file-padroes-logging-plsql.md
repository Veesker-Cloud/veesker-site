---
title: "DBMS_OUTPUT, UTL_FILE e padrões de logging para depuração PL/SQL em 2026"
description: "DBMS_OUTPUT nunca foi um sistema de logging. Veja o que usar no lugar — e quando cada padrão tem espaço legítimo num código PL/SQL que precisa sobreviver à produção."
date: "2026-09-28"
slug: "dbms-output-utl-file-padroes-logging-plsql"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "depuracao", "dbms-output", "logging"]
translation_slug: "dbms-output-utl-file-plsql-logging-patterns"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Todo desenvolvedor PL/SQL já passou por isso: uma stored procedure funciona perfeitamente na IDE e falha silenciosamente em um job agendado. O primeiro instinto é recorrer ao `DBMS_OUTPUT.PUT_LINE`. O segundo instinto, alguns dias depois, é perceber que essa era a ferramenta errada para um problema de depuração que precisava de um sistema de logging de verdade.

Isso não é uma crítica ao `DBMS_OUTPUT`. Ele faz exatamente o que diz na documentação: buffer de saída para ferramentas de cliente. O buffer acumula na memória da sessão, o cliente lê quando a chamada retorna e nada persiste em disco. É um design razoável para uma ferramenta interativa. É um design ruim para um procedimento de batch que dispara às 02:00 e falha de um jeito que você precisa rastrear uma semana depois.

A stack Oracle PL/SQL em 2026 oferece quatro padrões principais para rastreamento e logging. Cada um tem um contexto legítimo. O erro é usar o errado.

## Padrão 1: DBMS_OUTPUT — para que ele realmente serve

`DBMS_OUTPUT` funciona bem em exatamente um contexto: **desenvolvimento interativo em uma IDE ou sessão SQL*Plus**. Você está escrevendo um procedimento, quer ver o estado intermediário, chama `DBMS_OUTPUT.PUT_LINE` e o cliente exibe o buffer. Esse é o contrato.

Três coisas o quebram em produção.

Primeiro, o buffer tem um limite máximo fixo. O padrão é 20.000 bytes; o máximo que você pode configurar com `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)` é 1 MB. Um procedimento de batch que percorre dez milhões de linhas vai descartar mensagens silenciosamente ao ultrapassar esse limite — sem erro, sem aviso de truncamento, sem nenhum sinal.

Segundo, nada é gravado até a chamada retornar. Se o procedimento travar no meio da execução, o buffer que você queria inspecionar fica inacessível. A proposta de valor inteira — visibilidade intermediária — desaparece exatamente quando você mais precisa.

Terceiro, `DBMS_OUTPUT` não gera timestamps, níveis de severidade nem contexto de sessão. Correlacionar a saída de três sessões paralelas executando o mesmo procedimento é impossível depois do fato.

Use `DBMS_OUTPUT` durante o desenvolvimento. Pare antes de chegar à produção.

## Padrão 2: UTL_FILE — o trabalhador subestimado

`UTL_FILE` grava em um directory object no sistema de arquivos do servidor Oracle. Ele persiste, sobrevive ao término da sessão e consegue capturar saída sequencial de um job de batch que roda sem supervisão.

A configuração requer um grant de `CREATE DIRECTORY` e acesso de escrita no caminho do servidor:

```sql
CREATE OR REPLACE DIRECTORY app_logs AS '/opt/oracle/app_logs';
GRANT WRITE ON DIRECTORY app_logs TO app_user;
```

Um wrapper mínimo:

```sql
PROCEDURE escrever_log(p_msg IN VARCHAR2) IS
  v_file  UTL_FILE.FILE_TYPE;
  v_fname VARCHAR2(50) := 'batch_' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '.log';
BEGIN
  v_file := UTL_FILE.FOPEN('APP_LOGS', v_fname, 'A', 32767);
  UTL_FILE.PUT_LINE(
    v_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
    || ' [' || SYS_CONTEXT('USERENV', 'SESSION_USER') || '] '
    || p_msg
  );
  UTL_FILE.FCLOSE(v_file);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(v_file) THEN
      UTL_FILE.FCLOSE(v_file);
    END IF;
    RAISE;
END;
```

O padrão abre, grava e fecha o arquivo a cada chamada. Isso é deliberadamente defensivo: se o procedimento abortar no meio da execução, o arquivo é fechado em vez de corrompido. O custo é I/O de sistema de arquivos por linha de log, o que importa em loops de alta frequência, mas é irrelevante para a maioria dos jobs de batch onde as chamadas de log estão separadas por trabalho real.

Onde `UTL_FILE` se torna frágil: ambientes RAC onde a instância Oracle pode rodar em nós diferentes, ou qualquer configuração onde o caminho no sistema de arquivos local do servidor não é consistentemente visível. Se a instalação Oracle não garante um caminho estável no servidor local, `UTL_FILE` é frágil por arquitetura, não por qualidade de código.

## Padrão 3: Tabelas de logging com transações autônomas

O padrão que melhor envelhece em qualquer operação Oracle é uma tabela de log dedicada, gravada por meio de um **procedimento com transação autônoma**.

```sql
CREATE TABLE app_log (
  log_id     NUMBER GENERATED ALWAYS AS IDENTITY,
  logged_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
  level_cd   VARCHAR2(10),
  module_nm  VARCHAR2(100),
  msg        VARCHAR2(4000),
  session_id NUMBER DEFAULT SYS_CONTEXT('USERENV', 'SESSIONID')
);

CREATE OR REPLACE PROCEDURE registrar_log(
  p_level  IN VARCHAR2,
  p_module IN VARCHAR2,
  p_msg    IN VARCHAR2
) IS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (level_cd, module_nm, msg)
  VALUES (p_level, p_module, p_msg);
  COMMIT;
END;
```

`PRAGMA AUTONOMOUS_TRANSACTION` é o detalhe crítico. Sem ela, o `INSERT` em `APP_LOG` participa da transação chamadora. Se essa transação sofrer rollback — digamos, o procedimento de batch encontrar uma violação de constraint e relançar a exceção — seus registros de log fazem rollback junto. Você perde exatamente o rastro que precisava para entender por que falhou.

Com a transação autônoma, o commit do log é independente. O procedimento de batch pode lançar exceção, fazer rollback e terminar limpo, e `APP_LOG` retém cada entrada gravada até o ponto de falha. Esse é o comportamento observável que distingue essa abordagem de qualquer alternativa baseada em arquivo.

A vantagem prática sobre `UTL_FILE`: as entradas de log são consultáveis via SQL. Você pode fazer join com `V$SESSION`, filtrar por módulo e correlacionar entre sessões paralelas. Equipes de operações podem lê-las sem acesso SSH ao servidor Oracle.

Dois cuidados. Primeiro, a transação autônoma adiciona um commit por chamada de log. Logging de alta frequência dentro de um loop fechado — registrar cada linha de um cursor com dez milhões de linhas — vai saturar seus redo logs e desacelerar o batch de forma perceptível. Registre no nível que importa: quando uma fronteira de fase significativa é cruzada, não quando uma linha individual é processada. Segundo, dimensione e purgue `APP_LOG` intencionalmente. Uma tabela de logging sem política de retenção é um preenchimento lento de disco que eventualmente causa exatamente as falhas que você estava tentando rastrear.

## Padrão 4: DBMS_APPLICATION_INFO para rastreamento leve de sessão

`DBMS_APPLICATION_INFO` é subutilizado em relação ao quão bem funciona. Ele define atributos na sessão atual que ficam imediatamente visíveis em `V$SESSION` e `V$SQLAREA` — sem tabelas, sem arquivos, sem I/O além da escrita no SGA.

```sql
DBMS_APPLICATION_INFO.SET_MODULE(
  module_name => 'BATCH_RECONCILE',
  action_name => 'FASE_2_VALIDACAO'
);
DBMS_APPLICATION_INFO.SET_CLIENT_INFO(client_info => 'batch_id=20260928');
```

De uma sessão DBA ou de uma ferramenta de monitoramento, isso fica visível imediatamente:

```sql
SELECT module, action, client_info, status, sql_id
FROM   v$session
WHERE  module = 'BATCH_RECONCILE';
```

Os dados são ao vivo, não diferidos. Você pode acompanhar um procedimento de batch de longa duração avançando pelas suas fases em tempo real consultando `V$SESSION`. Não há schema para criar, não são necessárias permissões além de `EXECUTE ON DBMS_APPLICATION_INFO`, e não é preciso limpeza — os atributos são zerados quando a sessão termina.

A limitação é igualmente óbvia: nada persiste após o término da sessão. `DBMS_APPLICATION_INFO` é para visibilidade operacional em tempo real, não para forense depois do fato. Ele se combina bem com uma tabela de logging: use `SET_MODULE` e `SET_ACTION` para expor a fase atual durante a execução, e use `REGISTRAR_LOG` para gravar um registro durável nas fronteiras de fase. A combinação dá visibilidade ao vivo enquanto o batch roda e um histórico consultável quando termina.

## Escolhendo a ferramenta certa

Três perguntas determinam o padrão correto para um contexto:

1. **Isso precisa sobreviver ao término da sessão?** Se não, `DBMS_APPLICATION_INFO` é suficiente. Se sim, você precisa de `UTL_FILE` ou de uma tabela de log.
2. **Isso precisa sobreviver a um rollback?** Se sim, a tabela de log com `PRAGMA AUTONOMOUS_TRANSACTION` é a única resposta correta.
3. **Isso precisa ser consultável entre sessões?** Se sim, a tabela de log vence. `UTL_FILE` exige grep ou um leitor customizado para agregar entre arquivos de sessão.

Para a maior parte do trabalho PL/SQL em produção em 2026, a resposta certa é uma combinação: `DBMS_APPLICATION_INFO` para rastreamento de fase ao vivo, e uma tabela de log com transação autônoma para registros duráveis e consultáveis. `UTL_FILE` ganha seu espaço em ambientes onde uma abordagem baseada em tabela adiciona dependências de schema indesejadas — um pacote legado que você não pode modificar — ou em cenários onde você quer um artefato em texto plano para um pipeline de logs externo que já cuida de rotação e arquivamento.

`DBMS_OUTPUT` fica na IDE, onde é seu lugar.

## Como o Veesker se encaixa nisso

O painel de saída do Veesker captura `DBMS_OUTPUT` e exibe inline enquanto você executa procedimentos de forma interativa — esse é o contexto correto para ele. Mas quando você abre uma consulta em `V$SESSION` ou acompanha um job em execução, os atributos `MODULE` e `ACTION` definidos por `DBMS_APPLICATION_INFO` aparecem diretamente no grid de sessões, sem necessidade de query manual.

Se você construiu uma tabela `APP_LOG` usando o padrão de transação autônoma acima, a IA do Veesker conhece sua estrutura a partir da conexão local e pode ajudá-lo a escrever queries, filtrar por severidade e explicar padrões de correlação no contexto. Ela sabe a diferença entre uma coluna `TIMESTAMP WITH TIME ZONE` e uma `DATE`, e não vai sugerir `LIMIT` onde `FETCH FIRST` é o correto.

O Veesker é local-first por design: nada disso exige enviar seu schema ou histórico de queries a um serviço remoto. A Community Edition é Apache 2.0, disponível agora para Windows, macOS e Linux.

Se você está auditando ou construindo uma estratégia de logging PL/SQL, [baixe o Veesker](/download) e abra suas tabelas de log ao lado de `V$SESSION` em uma única janela — você vai encontrar o problema mais rápido do que alternando entre ferramentas.

— *Veesker*
