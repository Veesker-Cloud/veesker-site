---
title: "DBMS_OUTPUT, UTL_FILE e padrões de log para depuração em PL/SQL em 2026"
description: "Tres décadas de padrões de depuração em PL/SQL — DBMS_OUTPUT, UTL_FILE e tabelas de log com transação autônoma — analisadas pelo que ainda funciona e quando cada uma falha."
date: "2026-11-02"
slug: "dbms-output-utl-file-depuracao-plsql-2026"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "depuracao", "dbms-output", "logging"]
translation_slug: "dbms-output-utl-file-plsql-logging-2026"
read_minutes: 6
author: "claude-agent"
hero: "/datamap-hero.png"
---

A depuração em PL/SQL em 2026 começa da mesma forma que em 1997: `DBMS_OUTPUT.PUT_LINE`. Não porque seja a melhor ferramenta, mas porque está sempre disponível. Sem configuração, sem concessão de privilégios, sem objeto de diretório — adiciona uma linha, executa o bloco, lê o buffer. Para um teste rápido em uma função que está se comportando de forma estranha, isso é difícil de superar.

Mas "sempre disponível" não é o mesmo que "suficiente", e os três padrões que cobrem a depuração real em PL/SQL — `DBMS_OUTPUT`, `UTL_FILE` e tabelas de log com transação autônoma — têm perfis diferentes quanto ao que cobrem e onde deixam a desejar. Saber qual usar e conhecer os pontos de falha do que foi escolhido é o que separa um desenvolvedor PL/SQL que escreve código de produção de um que escreve código que funciona bem em ambiente de demonstração e quebra às 3 da manhã em produção.

## DBMS_OUTPUT: rápido, síncrono e com limite curto

`DBMS_OUTPUT` é um buffer circular que acumula linhas durante uma sessão PL/SQL e as entrega ao cliente quando a sessão termina ou quando o cliente chama `DBMS_OUTPUT.GET_LINES`. A implicação imediata é que não é um feed em tempo real. Um procedimento que demora dois minutos não imprime nada até terminar. Se ele lançar uma exceção não tratada e executar rollback, o buffer de saída é descartado junto com o contexto da sessão. Você não vê nada.

A segunda implicação é o limite do buffer. O padrão é 20.000 bytes. Você pode chamar `DBMS_OUTPUT.ENABLE(1000000)` para aumentá-lo para um milhão, mas esse limite ainda é finito. Um procedimento que processa um lote de 500.000 linhas e emite uma linha por registro vai transbordar o buffer antes de terminar e truncar silenciosamente a saída. Truncamento silencioso é o pior ponto de falha em uma sessão de depuração: você vê algumas linhas, elas parecem corretas, e conclui que o código está funcionando quando as linhas relevantes são exatamente as que nunca apareceram.

Use `DBMS_OUTPUT` para:

- **Testes rápidos em escala unitária** em procedimentos pequenos e de execução rápida.
- **Sessões SQL interativas** onde você quer uma confirmação rápida de que um caminho de código foi atingido.
- **Depuração durante o desenvolvimento** quando você mesmo está executando o bloco e o tempo de execução é curto.

Não use para:

- Jobs batch de longa duração.
- Log de erros que deve sobreviver a um rollback.
- Qualquer situação em que o momento da saída seja importante.

O problema da durabilidade em rollbacks pega desenvolvedores que conhecem bem o `DBMS_OUTPUT`, mas não pensaram nele com cuidado. Dentro de uma transação que eventualmente executa rollback, todas as chamadas ao `PUT_LINE` foram executadas — mas em um contexto que não existe mais. O buffer vai junto quando a sessão usa desmontagem implícita (blocos anônimos chamados por conexões de curta duração). Este é o momento em que as pessoas descobrem que o "log" nunca foi realmente salvo em lugar algum.

## UTL_FILE: durável, mas você está escrevendo no sistema de arquivos do servidor

`UTL_FILE` grava arquivos de texto no sistema de arquivos do servidor Oracle. Essa frase carrega a principal implicação de design: os arquivos ficam no servidor de banco de dados, não na máquina do cliente. Acessá-los requer um login de SO nesse servidor ou um mecanismo secundário para transferi-los. Em ambientes de nuvem ou infraestrutura gerenciada onde você não tem acesso via shell ao host do banco de dados, a saída do `UTL_FILE` se torna difícil de recuperar sem ferramentas adicionais.

Configurar o `UTL_FILE` requer um objeto de diretório:

```sql
CREATE OR REPLACE DIRECTORY log_dir AS '/opt/oracle/logs';
GRANT READ, WRITE ON DIRECTORY log_dir TO seu_schema;
```

O padrão de escrita é direto:

```plsql
DECLARE
  v_file UTL_FILE.FILE_TYPE;
BEGIN
  v_file := UTL_FILE.FOPEN('LOG_DIR', 'batch_run_20261102.log', 'A');
  UTL_FILE.PUT_LINE(v_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3') || ' Iniciando batch...');
  -- ... lógica do procedimento ...
  UTL_FILE.FCLOSE(v_file);
END;
```

O argumento de modo `'A'` adiciona ao arquivo se ele existir. `'W'` sobrescreve. Para log de produção, append é quase sempre a escolha certa — você quer um rastreamento contínuo entre múltiplas execuções, não um arquivo que recomeça do zero a cada vez.

`UTL_FILE` sobrevive a rollbacks. A gravação de arquivo é uma operação de SO fora do mecanismo de transação do Oracle, então mesmo que o bloco PL/SQL lance uma exceção e execute rollback no DML, as linhas já gravadas no arquivo permanecem. Essa durabilidade é a principal razão para preferi-lo ao `DBMS_OUTPUT` em jobs batch.

Os pontos de falha mais importantes:

**Erros de permissão no nível do SO** nem sempre ficam evidentes pela mensagem de erro do Oracle. O parâmetro legado `UTL_FILE_DIR` que algumas instalações ainda usam produz comportamento confuso quando misturado com objetos de diretório — os dois mecanismos de resolução não se compõem de forma limpa.

**Bloqueio de arquivo.** Múltiplas sessões gravando no mesmo nome de arquivo simultaneamente não é seguro. O padrão usual é incluir o ID de sessão ou um timestamp no nome do arquivo para garantir unicidade por execução.

**O arquivo fica no servidor.** Para serviços de banco de dados em nuvem ou ambientes onde o acesso ao host do banco de dados é restrito, o arquivo de log pode tanto não existir do ponto de vista do desenvolvedor. Isso não é um cenário hipotético: é o caso comum em Oracle Cloud, Exadata Cloud@Customer e muitas instalações gerenciadas.

## Tabelas de log com transação autônoma: o padrão que escala de verdade

A abordagem durável, consultável e segura para rollback é gravar registros de log em uma tabela usando uma transação autônoma. Uma transação autônoma é uma subtransação que faz commit independentemente da transação chamadora. Você pode registrar nela, confirmar o registro, e ele persiste mesmo se a transação externa executar rollback.

O padrão:

```sql
CREATE TABLE plsql_log (
  log_id     NUMBER GENERATED ALWAYS AS IDENTITY,
  log_time   TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
  session_id NUMBER,
  module     VARCHAR2(100),
  severity   VARCHAR2(10),
  message    CLOB
);
```

```plsql
CREATE OR REPLACE PROCEDURE log_msg(
  p_module   VARCHAR2,
  p_severity VARCHAR2,
  p_message  VARCHAR2
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO plsql_log (session_id, module, severity, message)
  VALUES (SYS_CONTEXT('USERENV', 'SID'), p_module, p_severity, p_message);
  COMMIT;
END;
```

Com `PRAGMA AUTONOMOUS_TRANSACTION`, o `COMMIT` dentro de `log_msg` confirma apenas o insert em `plsql_log`. A transação chamadora não é afetada. O registro de log persiste independentemente do que a transação externa fizer.

Essa abordagem permite consultas que `DBMS_OUTPUT` e `UTL_FILE` não conseguem oferecer: você pode fazer join dos registros de log com views do DBA, filtrar por sessão, comparar tempos de execução entre execuções e consultá-los em qualquer cliente SQL. Truncar a tabela com uma política de retenção é simples. Adicionar um índice em `(log_time, module)` mantém as consultas rápidas mesmo quando a tabela acumula meses de histórico.

O único custo são os commits por chamada de log. Para um loop interno intenso processando milhões de linhas, um commit de transação autônoma por iteração adiciona overhead real. Nesse caso, processe em lotes: acumule linhas em uma collection e despeje na tabela de log uma vez a cada mil linhas, em vez de uma por linha.

## DBMS_APPLICATION_INFO: metadados leves que você já tem

Há uma quarta opção que muitos desenvolvedores ignoram: `DBMS_APPLICATION_INFO`. Não é um mecanismo de logging, mas sim de anotação de metadados. Você o chama para definir os campos de módulo, ação e informação do cliente na sessão atual, que ficam visíveis em `V$SESSION`.

```plsql
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE(
    module_name => 'BATCH_RECONCILIACAO',
    action_name => 'FASE_1_EXTRACAO'
  );
  -- ... processamento ...
  DBMS_APPLICATION_INFO.SET_ACTION('FASE_2_TRANSFORMACAO');
  -- ... mais processamento ...
END;
```

Qualquer DBA monitorando `V$SESSION` ou `V$SQL` pode ver qual sessão está em qual fase, qual SQL está executando e qual é o evento de espera atual. O custo é praticamente zero — sem escritas, sem commits, sem handles de arquivo. Para jobs batch de longa duração onde você quer visibilidade operacional sem volume de log, anotar fases com `DBMS_APPLICATION_INFO` custa quase nada e fornece exatamente o que um DBA precisa para responder "esse batch está travado, ou ainda está processando?"

Isso não substitui o log. Complementa: sua tabela de transação autônoma captura o que aconteceu linha a linha; `DBMS_APPLICATION_INFO` informa a uma sessão de monitoramento o que está acontecendo agora.

## Escolhendo a ferramenta certa

A decisão não é complicada quando as propriedades estão claras:

| Situação | Ferramenta |
|---|---|
| Teste rápido durante o desenvolvimento, procedimento curto | `DBMS_OUTPUT` |
| Batch de produção, durabilidade necessária, sistema de arquivos do servidor acessível | `UTL_FILE` |
| Batch de produção, seguro para rollback, consultável, nuvem ou infra gerenciada | Tabela de log com transação autônoma |
| Job de longa duração, monitoramento operacional sem volume de log | `DBMS_APPLICATION_INFO` |

Na prática, a resposta certa para qualquer codebase PL/SQL de produção é a tabela de transação autônoma com anotações `DBMS_APPLICATION_INFO` por cima. `DBMS_OUTPUT` fica no ciclo de desenvolvimento, onde sua simplicidade é uma virtude genuína. `UTL_FILE` tem lugar em jobs batch que rodam em infraestrutura com sistema de arquivos de servidor acessível por operadores e precisam de arquivos de rastreamento linha a linha.

A janela de consulta do Veesker exibe resultados de `DBMS_OUTPUT` automaticamente — ative o buffer com um clique, execute seu bloco e a saída aparece em um painel dedicado abaixo do editor. O grid de resultados compartilha a mesma conexão, então consultar sua tabela `plsql_log` está a dois atalhos de teclado de distância da leitura do buffer. O contexto de versão da conexão está sempre à vista, o que importa quando você está depurando em um sistema 11g onde algumas assinaturas de subprogramas do `UTL_FILE` diferem da documentação 19c que você está consultando.

O Veesker é local-first por design: a IDE funciona totalmente offline, as credenciais ficam no keychain do SO e nada sai do desktop a menos que você ative explicitamente os recursos Cloud. A Community Edition é Apache 2.0 e está disponível agora. A camada Cloud — que adicionará agregação de logs gerenciada e histórico de consultas entre sessões — chega no segundo semestre de 2026.

---

[Baixe o Veesker](/download) e tenha resultados de `DBMS_OUTPUT`, consultas de `UTL_FILE` e monitoramento de `V$SESSION` em uma única janela, conectada a todas as versões Oracle que você suporta.

— *Veesker*
