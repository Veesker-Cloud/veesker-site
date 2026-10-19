---
title: "DBMS_OUTPUT, UTL_FILE e padroes de logging para debug de PL/SQL em 2026"
description: "Quando DBMS_OUTPUT e suficiente, quando UTL_FILE faz sentido e como tabelas de log com transacoes autonomas mudam o jogo no debug de PL/SQL em 2026."
date: "2026-10-19"
slug: "dbms-output-utl-file-logging-plsql-2026-pt"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "developer-tools"]
translation_slug: "dbms-output-utl-file-logging-plsql-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

DBMS_OUTPUT e mais antigo do que a maioria dos desenvolvedores que le este texto. Surgiu no Oracle 7.3, antes do JSON, do REST e da ideia de que um banco de dados pudesse se comunicar com qualquer coisa alem de outro Oracle. Em 2026 ainda e o primeiro recurso que a maioria dos desenvolvedores busca quando um pacote PL/SQL se comporta de forma inesperada. Isso nao e nostalgia — na maioria das vezes e a escolha pragmatica. Mas saber onde o DBMS_OUTPUT deixa de ser util, e o que usar no lugar, e o que separa uma sessao de debug de vinte minutos de uma que dura um dia inteiro.

## DBMS_OUTPUT: o que ele realmente e

DBMS_OUTPUT e um buffer. Ao chamar `DBMS_OUTPUT.PUT_LINE('algo')`, o Oracle escreve em um buffer em memoria associado a sessao atual. Esse buffer nao e enviado ao cliente ate que a execucao termine — ou ate que `DBMS_OUTPUT.GET_LINES` seja chamado explicitamente. Nao e um stream. Nao e em tempo real. Se seu procedimento rodar por noventa segundos e lancar um erro na ultima linha, voce ve toda a saida de uma so vez, depois da falha.

Isso tem duas consequencias praticas.

Primeiro, **a ordem e confiavel, mas o tempo nao e**. As linhas aparecem na ordem de insercao. Mas se voce quer entender quanto tempo cada etapa levou, DBMS_OUTPUT nao diz nada — a menos que voce insira `SYSTIMESTAMP` explicitamente.

Segundo, **o buffer tem tamanho maximo**. O padrao e 20.000 bytes — cerca de 300 linhas de saida de debug tipica antes de o Oracle comecar a descartar silenciosamente ou lancar um erro, dependendo da versao da chamada ENABLE. Voce pode aumentar:

```sql
-- Habilitar com 1 MB de buffer antes da chamada de teste
EXEC DBMS_OUTPUT.ENABLE(1000000);

BEGIN
  seu_pacote.executar(p_id => 42);
END;
/
```

No SQL*Plus e no SQLcl, `SET SERVEROUTPUT ON` cuida da chamada `GET_LINES` automaticamente. Em outros clientes, pode ser necessario habilitar a configuracao explicitamente por sessao. A maioria dos desenvolvedores esquece de chamar ENABLE, e depois fica sem entender por que a saida foi truncada silenciosamente na linha 78.

O Veesker habilita o DBMS_OUTPUT com 1 MB de buffer em cada nova sessao. O conteudo do buffer aparece no painel de Resultados ao terminar a execucao — sem o ritual de `SET SERVEROUTPUT ON`.

## Quando o DBMS_OUTPUT nao e suficiente

Dois cenarios forcam a ir alem do DBMS_OUTPUT.

**Jobs de longa duracao.** Um processo de reconciliacao noturna que roda por quatro horas nao se beneficia de saida que so pode ser lida depois. Se houver erro na terceira hora, voce quer saber o que aconteceu nas duas primeiras.

**Processos em segundo plano.** Qualquer coisa executada pelo DBMS_SCHEDULER, DBMS_JOB ou um processo em background do APEX nao tem sessao de cliente vinculada. Nao ha socket esperando por `GET_LINES`. O DBMS_OUTPUT nesses contextos e um buraco negro: as escritas funcionam, o buffer enche, e ninguem le.

## UTL_FILE: logging em arquivo

UTL_FILE escreve diretamente no sistema de arquivos do servidor Oracle. A configuracao requer um objeto de diretorio com permissao para o schema que vai escrever:

```sql
CREATE OR REPLACE DIRECTORY app_log_dir AS '/opt/oracle/logs/app';
GRANT READ, WRITE ON DIRECTORY app_log_dir TO seu_schema;
```

Uma chamada de logging fica assim:

```sql
DECLARE
  l_file UTL_FILE.FILE_TYPE;
BEGIN
  l_file := UTL_FILE.FOPEN('APP_LOG_DIR', 'reconciliacao.log', 'A');
  UTL_FILE.PUT_LINE(
    l_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
      || ' | INFO | batch_id=' || p_batch_id
  );
  -- ... seu trabalho aqui ...
  UTL_FILE.FCLOSE(l_file);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(l_file) THEN
      UTL_FILE.FCLOSE(l_file);
    END IF;
    RAISE;
END;
```

As escritas do UTL_FILE ficam visiveis no sistema de arquivos imediatamente, o que e util para monitoramento em tempo real via `tail -f` no servidor do banco. As contrapartidas sao reais:

- Os arquivos ficam no **servidor do banco**, nao na sua estacao de trabalho. Le-los requer acesso ao servidor, uma query wrapper com `UTL_FILE.GET_LINE`, ou um DBA disposto a enviar o log.
- Os handles de arquivo nao sao transacionais. Se a transacao externa for revertida por um rollback, as linhas ja escritas nao sao desfeitas junto. Isso pode ser uma vantagem ou um problema dependendo do objetivo do debug.
- No Oracle Cloud e em ambientes gerenciados, o sistema de arquivos frequentemente nao e acessivel aos schemas de aplicacao. UTL_FILE e principalmente uma opcao para instalacoes autogerenciadas onde o DBA controla o objeto de diretorio.

## Tabelas de log com transacoes autonomas

O padrao que sobrevive a ambos os cenarios — visibilidade em tempo real e contextos de execucao em segundo plano — e uma tabela dedicada de log escrita por meio de um procedimento com transacao autonoma.

```sql
-- A tabela de log
CREATE TABLE app_log (
  log_id         NUMBER GENERATED ALWAYS AS IDENTITY,
  log_ts         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
  log_level      VARCHAR2(10)  NOT NULL,   -- DEBUG, INFO, WARN, ERROR
  modulo         VARCHAR2(100),
  correlation_id VARCHAR2(64),
  msg            VARCHAR2(4000),
  CONSTRAINT app_log_pk PRIMARY KEY (log_id)
);

-- O procedimento de logging
CREATE OR REPLACE PROCEDURE app_log_write (
  p_level        IN VARCHAR2,
  p_modulo       IN VARCHAR2,
  p_msg          IN VARCHAR2,
  p_correlation  IN VARCHAR2 DEFAULT NULL
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (log_level, modulo, msg, correlation_id)
  VALUES (p_level, p_modulo, p_msg, p_correlation);
  COMMIT;
END app_log_write;
/
```

`PRAGMA AUTONOMOUS_TRANSACTION` cria uma subtransacao que faz commit de forma independente da transacao externa. Isso significa:

- As linhas de log ficam visiveis imediatamente em outras sessoes. Voce pode acompanha-las em uma janela de query separada enquanto o job principal roda.
- Se a transacao externa for revertida por um erro, as entradas de log sobrevivem. E exatamente isso que se quer para debug post-mortem.
- Jobs agendados, processos em background do APEX e qualquer outro contexto de execucao PL/SQL sem sessao podem chamar o mesmo procedimento.

O padrao tem um custo: cada escrita de log e um commit separado. Em um loop fechado escrevendo milhares de linhas por segundo, isso pode virar um gargalo de desempenho. A mitigacao usual e um nivel de severidade — logar `ERROR` e `WARN` incondicionalmente, e `INFO` e `DEBUG` so quando uma configuracao de sessao ou uma tabela de configuracao indicar:

```sql
-- Verificar nivel antes de logar
IF p_level IN ('ERROR', 'WARN')
   OR app_config.log_debug_habilitado(p_modulo) THEN
  app_log_write(p_level, p_modulo, p_msg, p_correlation);
END IF;
```

## DBMS_APPLICATION_INFO: rastreamento de progresso com baixo overhead

Entre o DBMS_OUTPUT (nada ate o fim da execucao) e a tabela de log (um commit por linha), existe uma opcao intermediaria: `DBMS_APPLICATION_INFO`.

```sql
DBMS_APPLICATION_INFO.SET_MODULE(
  module_name => 'RECONCILIACAO_NOTURNA',
  action_name => 'PASSO 3/7: CASAR_PAGAMENTOS'
);
```

Isso escreve nas colunas `MODULE` e `ACTION` de `V$SESSION`, que qualquer query de monitoramento pode ler sem o overhead de uma tabela de log:

```sql
SELECT sid, serial#, module, action, seconds_in_wait
FROM   v$session
WHERE  module = 'RECONCILIACAO_NOTURNA';
```

Nao e logging no sentido tradicional — nao captura valores intermediarios, apenas marcos de progresso. Mas para jobs de longa duracao em que a pergunta operacional e "em qual etapa esta agora?", custa quase nada e esta disponivel desde o Oracle 10g. Combina bem com uma tabela de log: use `SET_MODULE` e `SET_ACTION` para o progresso grosseiro, e `app_log_write` para os detalhes que voce realmente quer depurar.

## Logging estruturado para producao

Quando a transicao e de debug em desenvolvimento para observabilidade em producao, o padrao da tabela de log evolui para linhas estruturadas e consultraveis. Uma mensagem VARCHAR2 crua e adequada para um desenvolvedor lendo diretamente; uma equipe de operacoes precisa filtrar por ID de batch, por codigo de erro, por intervalo de tempo.

```sql
ALTER TABLE app_log ADD (
  ctx_json  VARCHAR2(4000)   -- contexto chave-valor em JSON
);
```

No Oracle 21c e posteriores, voce pode usar o tipo de coluna `JSON` nativo com armazenamento binario e indexacao completa por caminho JSON. No 19c e anteriores, uma coluna `VARCHAR2(4000)` com indice baseado em funcao sobre as chaves mais consultadas e a abordagem padrao:

```sql
CREATE INDEX app_log_batch_idx
  ON app_log (JSON_VALUE(ctx_json, '$.batch_id'));
```

As chamadas de log passam a carregar contexto estruturado:

```sql
app_log_write(
  p_level       => 'INFO',
  p_modulo      => 'RECONCILIACAO',
  p_msg         => 'Casados ' || l_count || ' pagamentos',
  p_correlation => l_batch_id
);

-- Ou com contexto JSON explicito
app_log_write(
  p_level  => 'ERROR',
  p_modulo => 'RECONCILIACAO',
  p_msg    => JSON_OBJECT(
    'evento'   VALUE 'falha_casar_pagamento',
    'batch_id' VALUE l_batch_id,
    'ora_err'  VALUE SQLERRM
  )
);
```

E as consultas entre batches ficam diretas:

```sql
SELECT log_ts, modulo, msg
FROM   app_log
WHERE  correlation_id = '2026-10-19-001'
ORDER  BY log_id;
```

## O que o Veesker faz com isso

O Veesker exibe o DBMS_OUTPUT no painel de Resultados automaticamente. Para o padrao de tabela de log, o navegador de schema identifica tabelas com chave primaria por identidade e uma coluna `TIMESTAMP WITH TIME ZONE` como candidatas a tabela de log, oferecendo uma visao de tail ao vivo — voce abre pelo arvore de objetos, define o intervalo de atualizacao e acompanha as linhas chegando enquanto o job roda em outra sessao.

A camada de IA e ciente do schema. Se voce pedir ajuda para adicionar saida de debug a um procedimento que ja chama `app_log_write`, a sugestao usara esse procedimento existente em vez de inserir um `DBMS_OUTPUT.PUT_LINE` avulso. Se o procedimento for identificado como rodando em um contexto de job DBMS_SCHEDULER — o que o Veesker infere do schema — a IA nao sugerira DBMS_OUTPUT. Ela sabe que nao ha sessao de cliente esperando pelo buffer.

A observabilidade em Oracle comeca no nivel da query. Seus logs de aplicacao dizem que uma requisicao falhou. Seus logs PL/SQL dizem por que, em qual etapa, com quais valores, e exatamente ha quanto tempo o problema ocorreu.

---

[Baixe o Veesker](/download) e depure seus pacotes PL/SQL com ferramentas cientes do schema, exibicao automatica de DBMS_OUTPUT e visoes de tail ao vivo em tabelas de log.

— *Veesker*
