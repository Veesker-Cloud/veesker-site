---
title: "DBMS_OUTPUT, UTL_FILE e padrões de log para depuração de PL/SQL em 2026"
description: "Um guia prático sobre as três ferramentas de depuração que todo desenvolvedor PL/SQL usa — DBMS_OUTPUT, UTL_FILE e uma tabela de log — e quando cada uma justifica seu uso."
date: "2026-09-21"
slug: "dbms-output-utl-file-depuracao-plsql-2026"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "depuracao", "dbms-output", "utl-file"]
translation_slug: "dbms-output-utl-file-plsql-debugging-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Desenvolvedores PL/SQL depuram código com `DBMS_OUTPUT.PUT_LINE` desde pelo menos o Oracle 7. O fato de essa abordagem ainda ser comum em 2026 não é sinal de atraso — é o reconhecimento pragmático de que as ferramentas disponíveis funcionam bem dentro de seus limites, e que entender esses limites é a maior parte do trabalho.

Este artigo cobre as três abordagens que atendem ao espectro real de depuração em PL/SQL: `DBMS_OUTPUT` para desenvolvimento interativo, `UTL_FILE` para rastreamentos persistentes, e uma tabela de log para tudo que precisa sobreviver além de uma sessão. Também cobre onde cada uma falha e o que buscar quando isso acontece.

## DBMS_OUTPUT: o que é e o que não é

`DBMS_OUTPUT` é um buffer do lado do servidor. Quando você chama `DBMS_OUTPUT.PUT_LINE('mensagem')` dentro de um bloco PL/SQL, o Oracle não escreve em nenhum fluxo de saída. Ele acrescenta a string a um buffer interno de pacote com escopo de sessão. A ferramenta cliente lê esse buffer após a conclusão da execução — usando internamente `DBMS_OUTPUT.GET_LINE` ou `DBMS_OUTPUT.GET_LINES` — e exibe os resultados.

Essa arquitetura tem implicações importantes.

**O buffer é lido após a conclusão do bloco.** Se você fica de olho no cliente esperando saída intermediária durante um procedimento demorado, não haverá nenhuma. As linhas aparecem todas de uma vez quando o Oracle devolve o controle ao cliente. Não há como descarregar o buffer no meio da execução usando as chamadas padrão do `DBMS_OUTPUT`.

**O buffer tem limite de tamanho.** O padrão é 20.000 bytes. Você pode aumentar com `DBMS_OUTPUT.ENABLE(buffer_size => NULL)` — no Oracle 10g e versões posteriores, `NULL` remove o limite completamente. No 9i, o máximo é um milhão de bytes. Além do limite ativo, novas chamadas `PUT_LINE` disparam `ORA-20000: ORU-10027: buffer overflow`.

**O buffer é estado de pacote, não fluxo de conexão.** Se o seu procedimento roda dentro de um job agendado, uma trigger, uma função chamada por uma consulta SQL ou qualquer contexto sem um cliente interativo conectado, as linhas do `DBMS_OUTPUT` somem sem deixar rastro. O job termina, a função retorna, e nada fica registrado. Esse é o ponto de falha que mais surpreende desenvolvedores.

Quando nenhuma dessas restrições te afeta — quando você executa um bloco de forma interativa e quer ver valores após a execução — `DBMS_OUTPUT` é eficaz. Não exige objetos de esquema, acesso ao sistema de arquivos nem privilégios especiais além da capacidade de executar PL/SQL. Para desenvolvimento exploratório, ainda é o padrão certo.

### Habilitando na sua sessão

O padrão canônico para um bloco anônimo:

```sql
BEGIN
  DBMS_OUTPUT.ENABLE(buffer_size => NULL);
  seu_procedimento(p_id => 42);
END;
/
```

A maioria das ferramentas habilita o `DBMS_OUTPUT` automaticamente para sessões interativas. Se o cliente não está mostrando a saída, verifique se `SET SERVEROUTPUT ON` está ativo (sintaxe SQL*Plus / SQLcl) ou se a opção de sessão equivalente está ligada.

## UTL_FILE: rastreamentos persistentes no sistema de arquivos

Quando você precisa de saída que sobreviva além de uma sessão interativa — de um job em lote noturno, uma carga ETL longa, uma janela de manutenção — `UTL_FILE` escreve diretamente em arquivos no sistema de arquivos do servidor de banco de dados.

A configuração exige um objeto de diretório, que mapeia um nome lógico para um caminho no sistema de arquivos do servidor:

```sql
-- DBA concede isso uma vez
CREATE OR REPLACE DIRECTORY log_dir AS '/var/oracle/logs';
GRANT READ, WRITE ON DIRECTORY log_dir TO app_user;
```

Escrever um arquivo de log fica assim:

```sql
DECLARE
  v_fh  UTL_FILE.FILE_TYPE;
  v_ts  VARCHAR2(30);
BEGIN
  v_ts := TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3');
  v_fh := UTL_FILE.FOPEN(
            'LOG_DIR',
            'etl_run_' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '.log',
            'A',
            32767
          );
  UTL_FILE.PUT_LINE(v_fh, v_ts || ' [INFO] Iniciando carga em lote');
  -- ... lógica do procedimento ...
  UTL_FILE.PUT_LINE(v_fh, v_ts || ' [INFO] Carga concluída');
  UTL_FILE.FCLOSE(v_fh);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(v_fh) THEN
      UTL_FILE.FCLOSE(v_fh);
    END IF;
    RAISE;
END;
```

Alguns pontos a ter em mente.

**O nome do diretório é sensível a maiúsculas em FOPEN.** `'LOG_DIR'` e `'log_dir'` resolvem objetos diferentes. A convenção é maiúsculas, correspondendo ao nome do objeto `CREATE DIRECTORY`.

**O parâmetro `max_linesize`** é o quarto posicional em `FOPEN`, não o terceiro — o terceiro é o modo de abertura (`'W'` para escrita, `'A'` para acréscimo, `'R'` para leitura). Defina `max_linesize` como 32767 se você estiver registrando textos SQL longos ou valores de variáveis grandes; o padrão de 1024 trunca linhas mais longas silenciosamente.

**O bloco EXCEPTION deve fechar o arquivo.** Um identificador de arquivo não fechado persiste até o fim da sessão. Sempre inclua uma verificação com `UTL_FILE.IS_OPEN` no tratador de exceção, ou a próxima tentativa de abertura pode disparar `UTL_FILE.INVALID_OPERATION`.

**UTL_FILE escreve no sistema de arquivos do servidor, não da máquina cliente.** Isso gera confusão frequente entre desenvolvedores que estão começando a usá-lo. O arquivo aparece no host que executa a instância Oracle — que pode ser um nó RAC, um banco de dados gerenciado na OCI ou um servidor remoto sem acesso direto por SSH. Quando você não consegue ler o sistema de arquivos do servidor diretamente, uma tabela de log é a opção mais adequada.

## Uma tabela de log: a alternativa durável e consultável

A abordagem mais flexível para cargas de trabalho em produção é uma tabela de log dedicada. Ela exige um objeto de esquema mínimo, funciona em qualquer contexto de execução — jobs, triggers, transações autônomas, código de aplicação — e a saída pode ser consultada com SQL simples.

```sql
CREATE TABLE app_log (
  log_id    NUMBER         GENERATED ALWAYS AS IDENTITY,
  log_ts    TIMESTAMP      DEFAULT SYSTIMESTAMP,
  log_level VARCHAR2(10),
  module    VARCHAR2(100),
  message   CLOB,
  CONSTRAINT app_log_pk PRIMARY KEY (log_id)
);
```

O procedimento que escreve nela usa uma transação autônoma, para que rollbacks no código chamador não apaguem o registro diagnóstico do que deu errado:

```sql
CREATE OR REPLACE PROCEDURE log_msg (
  p_level   VARCHAR2,
  p_module  VARCHAR2,
  p_msg     CLOB
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (log_level, module, message)
  VALUES (p_level, p_module, p_msg);
  COMMIT;
END log_msg;
/
```

`PRAGMA AUTONOMOUS_TRANSACTION` é o detalhe-chave. Sem ele, o INSERT participa da transação do chamador. Se o procedimento chamador falha e faz rollback, a linha de log vai junto — que é exatamente a situação em que você mais precisa do registro. A transação autônoma faz commit de forma independente, então a entrada de log sobrevive à falha.

Consultar erros recentes em um sistema em produção fica assim:

```sql
SELECT log_ts, log_level, module, SUBSTR(message, 1, 200)
FROM   app_log
WHERE  log_ts > SYSTIMESTAMP - INTERVAL '1' HOUR
ORDER  BY log_ts DESC
FETCH FIRST 50 ROWS ONLY;
```

Essa consulta usa `FETCH FIRST N ROWS ONLY`, que exige Oracle 12c ou posterior. No 11g e anteriores, o equivalente é:

```sql
SELECT * FROM (
  SELECT log_ts, log_level, module, SUBSTR(message, 1, 200)
  FROM   app_log
  WHERE  log_ts > SYSTIMESTAMP - INTERVAL '1' HOUR
  ORDER  BY log_ts DESC
)
WHERE ROWNUM <= 50;
```

O padrão de tabela de log funciona igualmente bem em produção, em jobs, em triggers e em qualquer código que roda sem cliente interativo. É a abordagem que os exemplos com assistência de IA do Veesker recomendam ao adicionar observabilidade a um pacote existente — porque produz artefatos que você pode consultar, indexar e reter, ao contrário de saídas que evaporam entre sessões.

## Uma nota sobre depuração passo a passo

O pacote `DBMS_DEBUG` do Oracle e seu sucessor baseado em JDWP permitem depuração passo a passo real de PL/SQL: definir pontos de parada, inspecionar variáveis durante a execução, avançar linha por linha dentro e fora de chamadas. O SQL Developer suporta isso há anos, e outras ferramentas têm suporte em diferentes graus.

A razão pela qual a maioria dos desenvolvedores Oracle ainda recorre ao `PUT_LINE` em vez de um depurador é o atrito operacional. A depuração passo a passo exige os privilégios `DEBUG CONNECT SESSION` e `DEBUG ANY PROCEDURE`, que muitas organizações não concedem em ambientes que não sejam de desenvolvimento puro. O protocolo de depuração também introduz latência perceptível em servidores remotos, tornando-o lento para qualquer coisa além de procedimentos curtos.

Para lógicas complexas rodando em um job ou em um esquema próximo de produção, uma tabela de log costuma ser mais prática: está sempre ativa, persiste entre sessões e conexões, e consultá-la com SQL é mais rápido do que navegar pela interface de um depurador para um procedimento invocado por um agendador.

## Juntando as três abordagens

O padrão que a maioria das equipes acaba adotando é o seguinte:

- **Desenvolvimento interativo:** `DBMS_OUTPUT` para feedback rápido, configuração zero.
- **Procedimentos e jobs de longa duração:** tabela de log com transação autônoma, consultável após a execução, sobrevive a rollbacks.
- **Situações onde mudanças de esquema não são possíveis** — pacotes de terceiros que você não pode modificar, restrições rígidas de esquema, sistemas legados: `UTL_FILE` com um objeto de diretório no servidor como alternativa.

Nenhuma das três substitui as outras. A decisão é guiada pelo contexto de execução: se não há cliente conectado, `DBMS_OUTPUT` é invisível; se não há acesso ao sistema de arquivos do servidor, `UTL_FILE` é inacessível. Escolha a que combina com onde o seu código roda.

O Veesker exibe os resultados do `DBMS_OUTPUT` em um painel dedicado abaixo do editor de consultas, formatado com timestamps de execução e contagem de linhas para que a saída de múltiplas execuções sequenciais permaneça distinguível. Para procedimentos que escrevem em uma tabela de log, o navegador de esquema exibe a tabela em contexto, e o painel de consultas trata tanto `FETCH FIRST N ROWS ONLY` quanto a forma com `ROWNUM` dependendo da versão do servidor conectado — assim a consulta em estilo tail que você escreve no 23ai também funciona quando colada na aba de conexão 11g.

A Edição Community é gratuita sob a licença Apache 2.0 e está disponível para Windows, macOS e Linux — [baixe em veesker.cloud/download](/download). Se a sua equipe precisa da camada de IA gerenciada para revisão e refatoração de PL/SQL, o plano Cloud estreia no segundo semestre de 2026 a $29 USD por assento por mês. [Entre na lista de espera](/#waitlist) para garantir o preço de fundador.

— *Veesker*
