---
title: "DBMS_OUTPUT, UTL_FILE e padrões de logging para debug de PL/SQL em 2026"
description: "Um guia prático sobre as ferramentas de depuração PL/SQL do Oracle: quando o DBMS_OUTPUT é suficiente, quando recorrer ao UTL_FILE ou a logs com transação autônoma, e o que o DBMS_APPLICATION_INFO oferece de graça."
date: "2026-11-16"
slug: "dbms-output-utl-file-debug-plsql-2026"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "dbms-output"]
translation_slug: "dbms-output-utl-file-plsql-debugging-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

`DBMS_OUTPUT` é provavelmente a ferramenta de depuração mais usada na história do Oracle e, ao mesmo tempo, a mais mal compreendida. Todo desenvolvedor PL/SQL já escreveu um `DBMS_OUTPUT.PUT_LINE('chegou aqui')` em algum momento. A maioria também já xingou quando o buffer encheu, a saída desapareceu ou simplesmente nada apareceu porque o bloco anônimo ainda não tinha terminado.

Este post cobre o panorama completo de logging e depuração de PL/SQL em 2026: o que o `DBMS_OUTPUT` consegue e o que não consegue fazer, quando o `UTL_FILE` justifica seu custo, o padrão de log com transação autônoma que deveria estar no arsenal de todo DBA, e algumas opções menos conhecidas, mas genuinamente úteis, que existem no Oracle há anos sem receber muita atenção.

## DBMS_OUTPUT: o que ele é de verdade

`DBMS_OUTPUT` é um buffer no servidor. Chamar `PUT_LINE` adiciona uma string a esse buffer. O cliente lê o buffer — normalmente chamando `DBMS_OUTPUT.GET_LINES` — depois que o bloco PL/SQL termina. Não é streaming. Não é em tempo real. Apenas o cliente que iniciou a chamada consome o buffer: o SQL*Plus usa `SET SERVEROUTPUT ON` para fazer a leitura após cada instrução; ferramentas como o SQL Developer chamam `GET_LINES` ao término da execução.

Esse design de buffer único, lido só ao final, é a raiz da maior parte das frustrações com `DBMS_OUTPUT`:

- Uma procedure de longa duração não mostra nada até terminar (ou travar).
- O tamanho padrão do buffer é 20 KB. Mesmo com `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)`, o buffer continua finito. Uma procedure que gera saída em loop intenso vai transbordar e o Oracle lança `ORA-20000: ORU-10027: buffer overflow, limit of <n> bytes`.
- No Oracle 11g, o tamanho do buffer tem limite de 1.000.000 bytes. No 12c em diante, `NULL` significa ilimitado — mas "ilimitado" é limitado pela pressão de memória no shared pool.
- A saída gerada por transações autônomas em procedures chamadas não aparece no buffer da sessão chamadora. Os dois buffers são independentes.

Para uma verificação rápida em uma sessão de desenvolvimento — cheguei até aqui, qual é o valor de X — o `DBMS_OUTPUT` é suficiente. Para qualquer coisa que rode por mais de alguns segundos, ou que você precise monitorar enquanto está em execução, ele é a ferramenta errada.

## UTL_FILE: quando você precisa de um rastro

`UTL_FILE` grava em arquivos no sistema de arquivos do servidor Oracle. É uma operação no lado do servidor: o arquivo aparece na máquina onde o processo Oracle roda, não na máquina onde está o seu cliente SQL.

Um módulo mínimo de logging:

```sql
PROCEDURE log_msg (
    p_message  IN VARCHAR2,
    p_logfile  IN UTL_FILE.FILE_TYPE
) IS
BEGIN
    UTL_FILE.PUT_LINE(
        p_logfile,
        TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
            || ' | ' || p_message
    );
    UTL_FILE.FFLUSH(p_logfile);  -- flush imediato
END;
```

`FFLUSH` é o detalhe que a maioria dos exemplos omite. Sem ele, o Oracle agrupa as escritas e você não verá a saída no arquivo até que o buffer esvazie ou o handle seja fechado. Durante uma migração demorada, o `FFLUSH` é o que torna o arquivo de log legível em outra sessão enquanto o job ainda está rodando.

`UTL_FILE` exige um objeto directory no servidor Oracle:

```sql
CREATE OR REPLACE DIRECTORY log_dir AS '/opt/oracle/diag/logs';
GRANT WRITE ON DIRECTORY log_dir TO the_user;
```

A limitação é óbvia: os arquivos ficam no sistema de arquivos do servidor do banco. Se você está depurando em uma instância de desenvolvimento com acesso SSH, isso funciona. Se o banco está em um servidor compartilhado atrás de um firewall, esses arquivos não são visíveis sem ajuda de um DBA. E `UTL_FILE` não consegue gravar em um caminho na sua máquina local. Para equipes que não controlam o sistema de arquivos do servidor, a tabela de log com transação autônoma é uma opção melhor.

## DBMS_APPLICATION_INFO: a opção leve que ninguém usa

`DBMS_APPLICATION_INFO` não grava em buffer nem em arquivo. Ele atualiza as views `V$SESSION` e `V$SESSION_LONGOPS` em tempo real. Isso o torna genuinamente útil para monitorar um job em execução a partir de uma segunda sessão.

```sql
BEGIN
    DBMS_APPLICATION_INFO.SET_MODULE(
        module_name => 'ETL_LOAD_ORDERS',
        action_name => 'PASSO 1: TRUNCATE STAGING'
    );
    -- truncate staging...

    DBMS_APPLICATION_INFO.SET_ACTION('PASSO 2: BULK COLLECT');
    -- bulk collect...

    DBMS_APPLICATION_INFO.SET_ACTION('PASSO 3: INSERT FROM STAGING');
    -- insert final...
END;
```

Em outra sessão:

```sql
SELECT module, action, status FROM v$session
WHERE username = 'ETL_USER';
```

Para jobs de longa duração, `SET_SESSION_LONGOPS` permite reportar o percentual de conclusão em `V$SESSION_LONGOPS`, que a maioria das ferramentas de monitoramento Oracle exibe diretamente. A visibilidade em nível de sessão é em tempo real, não exige buffer e sobrevive a uma falha melhor do que um buffer de `DBMS_OUTPUT` que você não consegue ler.

## A tabela de log com transação autônoma

O padrão de logging PL/SQL mais robusto usa uma transação autônoma para gravar em uma tabela de log independentemente do estado de commit/rollback da transação chamadora.

```sql
CREATE TABLE app_log (
    log_id    NUMBER GENERATED ALWAYS AS IDENTITY,
    logged_at TIMESTAMP DEFAULT SYSTIMESTAMP,
    module    VARCHAR2(64),
    severity  VARCHAR2(10),
    message   VARCHAR2(4000)
);

CREATE OR REPLACE PROCEDURE log_to_table (
    p_module   IN VARCHAR2,
    p_severity IN VARCHAR2,
    p_message  IN VARCHAR2
) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
    INSERT INTO app_log (module, severity, message)
    VALUES (p_module, p_severity, p_message);
    COMMIT;  -- faz commit apenas da transação autônoma
END;
/
```

O `PRAGMA AUTONOMOUS_TRANSACTION` é o ponto central. A procedure abre uma transação separada dentro da chamada, faz commit e retorna. Se a transação externa for revertida depois, as linhas de log não são afetadas. É exatamente o que você quer ao depurar um batch com falha: o log do que aconteceu sobrevive ao rollback que limpou o estado após o erro.

O custo existe — um commit de transação autônoma por linha não é gratuito. Esse padrão pertence a handlers de exceção e marcos importantes de etapas, não dentro de loops internos que executam milhões de vezes. Para logging de alta frequência, grave em uma coleção em memória e faça um bulk-insert na tabela de log em um único commit autônomo nos marcos das etapas:

```sql
-- versão com flush em lote
PROCEDURE flush_log_buffer (p_buffer IN log_msg_tbl) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
    FORALL i IN INDICES OF p_buffer
        INSERT INTO app_log (module, severity, message)
        VALUES (p_buffer(i).module, p_buffer(i).severity, p_buffer(i).message);
    COMMIT;
END;
```

## Compilação condicional e diretivas de introspecção

O Oracle 10g introduziu compilação condicional com `$$PLSQL_LINE`, `$$PLSQL_UNIT` e o construto `$IF/$END`. Em 2026, esses recursos ainda são subutilizados.

```sql
PROCEDURE process_batch (p_id IN NUMBER) IS
BEGIN
    log_to_table(
        'process_batch', 'DEBUG',
        $$PLSQL_UNIT || ':' || $$PLSQL_LINE
            || ' iniciando com id=' || p_id
    );
    -- ...
EXCEPTION
    WHEN OTHERS THEN
        log_to_table(
            'process_batch', 'ERROR',
            $$PLSQL_UNIT || ':' || $$PLSQL_LINE
                || ' ' || SQLERRM
        );
        RAISE;
END;
```

`$$PLSQL_UNIT` resolve para o nome da procedure em tempo de compilação. `$$PLSQL_LINE` resolve para o número da linha no fonte. São constantes de tempo de compilação — sem custo em tempo de execução além da concatenação de strings — e fornecem às mensagens de erro as duas informações que quase nunca aparecem: quem e onde.

Usando `$IF DBMS_DB_VERSION.VER_LE_11 $THEN ... $END`, você pode condicionar caminhos de código à versão do banco sem verificações em tempo de execução. Isso importa quando você mantém packages que rodam do 11g ao 23ai e quer diagnósticos específicos do 23ai sem quebrar o build no 11g.

## Escolhendo a ferramenta certa

Um guia de decisão:

**Verificação rápida e pontual em um bloco curto.** `DBMS_OUTPUT`. Adequado, familiar, sem configuração.

**Monitorar um job em execução a partir de outra sessão.** `DBMS_APPLICATION_INFO.SET_MODULE` e `SET_ACTION`. Gratuito, em tempo real, consultável via SQL, sobrevive a falhas.

**Log durável que sobrevive a rollback.** Tabela de log com transação autônoma. A resposta certa para batch jobs e ETL.

**Gravar em arquivo no servidor.** `UTL_FILE`. Use quando você precisa de um artefato em arquivo ou quando o schema da tabela alvo não está disponível. Sempre chame `FFLUSH`.

**Profiling de performance.** `DBMS_TRACE` e `DBMS_HPROF` (o profiler hierárquico, disponível desde o Oracle 11g). A ferramenta certa quando você já identificou *o que* está lento e precisa encontrar *onde*.

## O que o Veesker adiciona

A IDE exibe o `DBMS_OUTPUT` da conexão logo após a execução de cada instrução no painel de saída — isso qualquer ferramenta faz. O que é diferente: o Veesker também lê o `V$SESSION` para conexões ativas e exibe o módulo e a ação atuais do `DBMS_APPLICATION_INFO` ao vivo na aba de sessão. Se você está executando um job em uma aba e quer ver a ação atual sem abrir uma segunda aba e escrever uma consulta no `V$SESSION`, o painel de sessão já mostra.

Para o padrão de tabela de log com transação autônoma, o editor de consultas suporta intervalos de atualização automática tão curtos quanto um segundo. Aponte uma consulta para `app_log` com filtro de timestamp recente, ative o auto-refresh e observe as linhas chegando enquanto o job roda. Não é um viewer de log em streaming, mas funciona como um para jobs que registram em uma cadência legível para humanos.

A camada de IA reconhece chamadas de `PRAGMA AUTONOMOUS_TRANSACTION` e `DBMS_APPLICATION_INFO` no contexto, e por isso não vai sugerir substituir um log com transação autônoma por `DBMS_OUTPUT` — o que alteraria silenciosamente a semântica de rollback — quando você pedir para refatorar uma procedure de logging.

O Veesker é local-first por design. A IDE roda na sua máquina, conecta diretamente ao Oracle e processa os dados de `DBMS_OUTPUT` e `V$SESSION` localmente. Nada da sua saída de sessão ou dos resultados das consultas passa pelos servidores da Veesker. Isso importa quando o banco que você está depurando contém dados de produção que não podem ser exportados.

`DBMS_OUTPUT` não vai desaparecer, e não deveria. É a ferramenta certa para uma certa classe de problema. O erro é recorrer a ele quando o problema é "preciso saber o que um job está fazendo enquanto roda" ou "preciso de um log que sobreviva a um rollback." Para esses casos, o Oracle entregou as ferramentas certas há anos — a maioria das bases de código simplesmente ainda não as adotou.

---

Baixe o Veesker para o seu desenvolvimento Oracle: [veesker.cloud/download](/download).

— *Veesker*
