---
title: "DBMS_OUTPUT, UTL_FILE e padrões de logging para debug em PL/SQL em 2026"
description: "Um guia prático sobre padrões de debug em PL/SQL — de DBMS_OUTPUT a UTL_FILE, DBMS_APPLICATION_INFO e tabelas de log com transação autônoma."
date: "2026-11-23"
slug: "dbms-output-utl-file-debug-plsql-2026"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "pl-sql", "debugging", "logging", "dbms-output"]
translation_slug: "dbms-output-utl-file-plsql-logging-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Desenvolvedores PL/SQL em 2026 ainda recorrem ao mesmo kit de debug que usavam em 2010. Isso não é falta de criatividade. É o reflexo do que realmente funciona em ambientes de produção onde não dá para anexar um depurador, não dá para replicar os dados localmente e não há margem para o overhead de um agente APM completo no caminho crítico. DBMS_OUTPUT, UTL_FILE e uma tabela de log feita na mão são soluções duradouras justamente porque impõem overhead quase zero sobre o banco de dados e não exigem nenhuma infraestrutura além do próprio Oracle.

Este post mapeia a ferramenta certa para cada situação, mostra os padrões que se sustentam em escala e aponta as armadilhas que a maioria dos tutoriais passa em branco.

## DBMS_OUTPUT: rápido, mas limitado

DBMS_OUTPUT é o equivalente Oracle de um `printf`. Você chama `DBMS_OUTPUT.PUT_LINE`, a mensagem se acumula em um buffer de sessão e o cliente lê esse buffer após a execução terminar. Essa última parte é a primeira armadilha: **você não vê a saída durante a execução**. Se um bloco PL/SQL roda por três minutos, nada aparece até ele finalizar ou falhar. Para jobs batch de longa duração, isso o torna praticamente inútil como sinal de progresso em tempo real.

O buffer tem um limite. O padrão é 20.000 bytes; é possível aumentar com `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)`, mas há um teto próximo de 1 MB que varia por versão. Qualquer saída além do buffer é descartada silenciosamente — sem exceção, sem marcador de truncamento, sem aviso. Se você está logando um processo de 50 etapas e só vê 30 linhas, o buffer pode ter transbordado bem antes da última linha legível.

```sql
BEGIN
  DBMS_OUTPUT.ENABLE(buffer_size => 1000000);
  FOR i IN 1 .. 100 LOOP
    DBMS_OUTPUT.PUT_LINE(
      TO_CHAR(SYSTIMESTAMP, 'HH24:MI:SS.FF3') || ' etapa ' || i
    );
  END LOOP;
END;
/
```

Inclua timestamps na mensagem, não só números de sequência. Ao correlacionar saída do DBMS_OUTPUT com um trace file ou um relatório AWR, `etapa 7` sozinha não diz nada sem saber quando a etapa 7 ocorreu.

Onde o DBMS_OUTPUT se destaca: **debug interativo**. Verificações rápidas do tipo "esse branch está sendo alcançado?". Validação de saída de cursor em conjuntos pequenos. Observar um valor calculado por uma procedure antes de conectá-la a um job maior. Para qualquer coisa que rode sem supervisão ou por mais de um minuto, use outra abordagem.

## UTL_FILE: logging persistente em disco

UTL_FILE escreve em arquivos no sistema de arquivos do servidor Oracle. O arquivo persiste após o encerramento da sessão, não está limitado por um buffer de sessão e pode ser aberto por múltiplas sessões em modo append. Essas propriedades o tornam útil para logs de jobs batch que precisam sobreviver a desconexões de sessão ou reinicializações de processo.

Pré-requisito: um objeto DIRECTORY do Oracle apontando para um caminho no sistema de arquivos, com o schema executor tendo grant de READ e WRITE nesse diretório.

```sql
-- Setup pelo DBA, uma vez
CREATE OR REPLACE DIRECTORY LOG_DIR AS '/var/oracle/logs/app';
GRANT READ, WRITE ON DIRECTORY LOG_DIR TO app_owner;
```

Uma procedure de logging mínima:

```sql
CREATE OR REPLACE PROCEDURE write_log(
  p_severity IN VARCHAR2,
  p_message  IN VARCHAR2
) AS
  v_file UTL_FILE.FILE_TYPE;
BEGIN
  v_file := UTL_FILE.FOPEN(
    location     => 'LOG_DIR',
    filename     => 'app_' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '.log',
    open_mode    => 'A',
    max_linesize => 32767
  );
  UTL_FILE.PUT_LINE(
    v_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
      || ' [' || RPAD(p_severity, 5) || '] '
      || p_message
  );
  UTL_FILE.FCLOSE(v_file);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(v_file) THEN
      UTL_FILE.FCLOSE(v_file);
    END IF;
END;
/
```

Dois padrões nessa procedure que importam em produção. Primeiro, **rotação diária pelo nome do arquivo**: um log por dia, nomeado `app_20261123.log`. A rotação por data é automática e gratuita; a limpeza fica a cargo de um cron do DBA fora do Oracle. Segundo, o bloco `EXCEPTION` que engole erros do UTL_FILE. Uma chamada de log que falha e propaga uma exceção é pior do que uma que falha silenciosamente — o processo de negócio não deve morrer porque o diretório de log ficou sem espaço.

A armadilha comum com UTL_FILE é o modelo de permissões do diretório. Se o DBA cria o objeto DIRECTORY apontando para `/var/oracle/logs/app` mas o usuário OS do Oracle não tem permissão de escrita nesse caminho, toda escrita falha no nível do SO e o erro aparece como `UTL_FILE.INVALID_PATH` ou `UTL_FILE.ACCESS_DENIED`. Separar "o objeto DIRECTORY existe no Oracle" de "o caminho no SO é gravável pelo usuário oracle" resolve a maior parte dessas falhas imediatamente.

## DBMS_APPLICATION_INFO: instrumentação leve da sessão

Antes de logar qualquer coisa em arquivo ou tabela, vale a pena instrumentar a própria sessão. `DBMS_APPLICATION_INFO.SET_MODULE` escreve o nome da operação e da ação correntes na linha da sessão em `V$SESSION`. Essa informação fica visível para DBAs monitorando sessões ativas, aparece em relatórios AWR e ASH e não tem custo mensurável.

```sql
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE(
    module_name => 'LOTE_FATURA',
    action_name => 'carregar_linhas_fatura'
  );
  -- executa o trabalho
  DBMS_APPLICATION_INFO.SET_ACTION('reconciliar_totais');
  -- próxima fase
  DBMS_APPLICATION_INFO.SET_MODULE(NULL, NULL);
END;
/
```

As colunas de módulo e ação aparecem em `V$SESSION.MODULE` e `V$SESSION.ACTION`, nos relatórios de top SQL do AWR agrupados por módulo e nos dados do ASH via `DBA_HIST_ACTIVE_SESS_HISTORY`. Se um DBA for questionado "o que o lote estava fazendo às 14h32?" e o lote tiver configurado o módulo corretamente, a resposta está nas views de histórico sem precisar parsear nenhum log da aplicação.

Este é o padrão menos utilizado dos três. Não tem custo, não é uma chamada de rede e conecta o processo batch à infraestrutura de monitoramento do Oracle que o DBA já acompanha.

## Criando sua própria tabela de log

Para dados de log estruturados que precisam persistir indefinidamente, ser consultados com SQL e ficarem visíveis para múltiplos usuários ao mesmo tempo, uma tabela de log supera o UTL_FILE. O ingrediente-chave é `PRAGMA AUTONOMOUS_TRANSACTION`: o INSERT e o COMMIT na procedure de log ocorrem em uma transação independente, portanto persistem mesmo que a transação chamadora faça rollback.

```sql
CREATE TABLE app_log (
  log_id    NUMBER         GENERATED ALWAYS AS IDENTITY,
  log_time  TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
  severity  VARCHAR2(10)   NOT NULL,
  module    VARCHAR2(100),
  message   VARCHAR2(4000),
  CONSTRAINT app_log_pk PRIMARY KEY (log_id)
)
ORGANIZATION INDEX
COMPRESS ADVANCED LOW;
```

```sql
CREATE OR REPLACE PROCEDURE log_msg(
  p_severity IN VARCHAR2,
  p_module   IN VARCHAR2 DEFAULT NULL,
  p_message  IN VARCHAR2
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (severity, module, message)
  VALUES (p_severity, p_module, p_message);
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/
```

`ORGANIZATION INDEX` e `COMPRESS ADVANCED LOW` merecem atenção para uma tabela que crescerá continuamente. Uma tabela organizada por índice elimina o overhead de linha para uma tabela cujo único padrão de acesso é "INSERT e consulta por intervalo de tempo". A compressão Advanced Low (disponível a partir do 12c) reduz o armazenamento para os valores repetitivos de severity e module sem overhead mensurável de escrita.

O limite prático: logging de altíssima frequência — milhares de inserções por segundo — vai gerar contenção nos blocos folha do índice. Para esse volume, escreva em UTL_FILE e ingira o arquivo na tabela de log com uma tabela externa ou um job em background. A tabela serve para correlação e auditoria; o arquivo, para throughput de alto volume.

## Como o Veesker se integra a esses padrões

O Veesker exibe a saída do DBMS_OUTPUT inline na planilha SQL. O buffer é lido automaticamente após cada execução de bloco anônimo e mostrado em um painel abaixo dos resultados, com os timestamps preservados. Não é necessário chamar `DBMS_OUTPUT.GET_LINE` manualmente nem alternar para uma sessão SQL*Plus separada.

Para tabelas de log, o navegador de schema reconhece estruturas no estilo `app_log` e as sugere no autocompletar ao escrever consultas contra `V$SESSION` ou views AWR. A camada de IA, fundamentada na versão do banco conectado e no schema local, sugere o padrão correto com `PRAGMA AUTONOMOUS_TRANSACTION` em vez do erro comum de usar uma transação regular que faz commit da transação chamadora como efeito colateral. A IDE roda localmente — a análise do schema e o contexto da IA ficam na sua máquina, sem que metadados de schema saiam do desktop.

Consultas estruturadas de log — correlacionando linhas de `app_log` com o estado de `V$SESSION` no momento da execução — são uma funcionalidade que a camada Cloud vai suportar com queries sensíveis ao schema. Em breve, H2 2026.

## A ferramenta certa para cada situação

| Situação | Padrão |
|---|---|
| Debug interativo, execuções curtas | DBMS_OUTPUT |
| Progresso de batch, persistência server-side | UTL_FILE |
| Visibilidade da sessão para monitoramento | DBMS_APPLICATION_INFO |
| Log consultável, durável e multiusuário | Tabela com transação autônoma |

Nenhum desses padrões é novo. A disciplina está em saber qual se aplica à situação, combiná-los intencionalmente — configure o módulo com APPLICATION_INFO, escreva na tabela com a procedure autônoma, reserve o DBMS_OUTPUT para a sessão interativa — e não tratar um print statement como estratégia de logging em produção.

Faça o download do Veesker para trabalhar com esses padrões em uma IDE que os compreende: [veesker.cloud/download](/download).

— *Veesker*
