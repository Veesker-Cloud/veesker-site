---
title: "DBMS_OUTPUT, UTL_FILE e padrões de logging para depuração em PL/SQL em 2026"
description: "Quatro estratégias de logging em PL/SQL comprovadas na prática — e quando cada uma é a ferramenta certa para o trabalho."
date: "2026-10-12"
slug: "padroes-logging-debugging-plsql-2026"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "ferramentas-desenvolvedor"]
translation_slug: "plsql-logging-debugging-patterns-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Se você escreve PL/SQL há algum tempo, conhece o ritual. Adiciona um `DBMS_OUTPUT.PUT_LINE` na linha suspeita. Executa o procedure. Examina o buffer. Decide se aquele valor era o esperado. Adiciona mais três linhas. Executa de novo. Repete até o incidente em produção acabar ou sua paciência se esgotar, o que vier primeiro.

DBMS_OUTPUT não é uma ferramenta ruim. É uma ferramenta mal usada. Entender onde ela para de ser útil — e o que as alternativas fazem quando DBMS_OUTPUT não consegue — é a diferença entre uma sessão de diagnóstico que dura vinte minutos e uma que dura uma manhã inteira.

## O que DBMS_OUTPUT realmente faz, e o que não faz

DBMS_OUTPUT funciona acrescentando linhas a um buffer de memória no nível da sessão. Seu cliente consulta esse buffer depois que a chamada termina. Duas palavras nessa frase importam: *nível da sessão* e *depois*.

Nível da sessão significa que o buffer é privado. Nenhuma outra sessão pode vê-lo. Se você estiver depurando um procedure invocado por um job, por uma ação do APEX ou por outra aplicação, a saída vai para o buffer vinculado *àquela* sessão. A menos que seu depurador esteja conectado à sessão certa, a saída não chega a lugar nenhum que você consiga ler.

Depois significa que o cliente lê na conclusão. Não há streaming. Se seu procedure roda por noventa segundos, você vê toda a saída no segundo noventa e um, não durante a execução. Mais concretamente: se seu procedure lança uma exceção não tratada antes de concluir, se você recebe as linhas do buffer depende do driver e do cliente. Alguns clientes descartam o buffer em caso de erro; outros o exibem. Não dá para contar com isso.

O buffer tem um limite de tamanho configurável. `DBMS_OUTPUT.ENABLE` aceita um parâmetro `buffer_size` com padrão de 20.000 bytes e máximo prático de 1.000.000. Um procedure prolixo transborda silenciosamente — nenhum erro, apenas saída truncada a partir de um ponto que você não escolheu.

Para desenvolvimento interativo em uma única sessão SQL, DBMS_OUTPUT é exatamente o certo. Não exige configuração, não deixa artefatos e mantém o ciclo de feedback enxuto. Para qualquer coisa que rode fora da sua sessão direta — jobs, triggers, callbacks do APEX, qualquer coisa assíncrona — é a camada errada.

## UTL_FILE: quando você precisa de um rastro permanente

UTL_FILE abre um arquivo no sistema de arquivos do servidor de banco de dados e escreve nele a partir do PL/SQL. A configuração requer um directory object apontando para um caminho no servidor com permissão de escrita para o Oracle, mas uma vez feito isso, o padrão é direto:

```sql
DECLARE
  v_log UTL_FILE.FILE_TYPE;
BEGIN
  v_log := UTL_FILE.FOPEN(
    'LOG_DIR',
    'carga_etl_' || TO_CHAR(SYSDATE, 'YYYYMMDD_HH24MI') || '.log',
    'W'
  );
  UTL_FILE.PUT_LINE(
    v_log,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3') || ' Iniciando carga'
  );
  -- corpo do procedure
  UTL_FILE.PUT_LINE(
    v_log,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
      || ' Concluído: ' || v_rows_loaded || ' linhas'
  );
  UTL_FILE.FCLOSE(v_log);
EXCEPTION
  WHEN OTHERS THEN
    UTL_FILE.PUT_LINE(v_log, 'ERRO: ' || SQLCODE || ' ' || SQLERRM);
    UTL_FILE.FCLOSE(v_log);
    RAISE;
END;
```

A vantagem sobre DBMS_OUTPUT é a permanência. Um arquivo no servidor ainda está lá se a sessão terminar inesperadamente. Pode ser acompanhado em tempo real se você tiver acesso ao sistema operacional do host do banco. Não está atrelado ao ciclo de vida da sessão do cliente.

As desvantagens são práticas. Você precisa de acesso ao nível do SO para ler o log, ou de um segundo mecanismo para trazer o conteúdo do arquivo de volta ao SQL. A configuração do directory object é uma tarefa de DBA em ambientes compartilhados ou gerenciados. E a escrita no arquivo, embora geralmente rápida, não tem custo zero em loops fechados sobre grandes volumes de dados.

UTL_FILE tem o seu lugar em ETL em lote, jobs agendados e qualquer procedure que rode sem uma sessão de usuário ativa monitorando. Para depuração interativa no dia a dia, é mais configuração do que o trabalho exige.

## A tabela de logging com AUTONOMOUS_TRANSACTION

O padrão que sobrevive a ambos os casos — interativo e assíncrono, conclusão normal e caminhos de exceção — é uma tabela de logging sustentada por um procedure com transação autônoma. A pragma fundamental é `PRAGMA AUTONOMOUS_TRANSACTION`.

```sql
CREATE TABLE app_log (
  log_id    NUMBER GENERATED ALWAYS AS IDENTITY,
  log_ts    TIMESTAMP(6) DEFAULT SYSTIMESTAMP NOT NULL,
  modulo    VARCHAR2(128),
  nivel     VARCHAR2(10),
  mensagem  VARCHAR2(4000),
  session_id NUMBER
);

CREATE OR REPLACE PROCEDURE log_evento (
  p_modulo  IN VARCHAR2,
  p_nivel   IN VARCHAR2,
  p_msg     IN VARCHAR2
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (modulo, nivel, mensagem, session_id)
  VALUES (
    p_modulo, p_nivel, p_msg,
    SYS_CONTEXT('USERENV', 'SID')
  );
  COMMIT;
END;
/
```

`PRAGMA AUTONOMOUS_TRANSACTION` faz cada INSERT acontecer em uma transação completamente separada da chamadora. Quando o procedure que faz a chamada sofre rollback — por uma exceção ou por um `ROLLBACK` deliberado — as linhas de log sobrevivem. Essa é a capacidade que DBMS_OUTPUT não tem: um procedure que falha não deixa buffer nenhum para trás, mas uma tabela de logging com essa pragma deixa um registro completo de tudo o que aconteceu até o ponto da falha.

O INSERT é barato, mas a tabela precisa de manutenção básica para continuar assim. Uma partição mensal em `LOG_TS`, ou um job agendado que deleta linhas com mais de trinta dias, é a configuração padrão. Um índice em `(MODULO, LOG_TS)` cobre as consultas que você vai realmente executar: "me mostra todos os erros no ETL noturno de terça passada."

A leitura é SQL simples. Sem acesso ao SO. Funciona de qualquer sessão, qualquer ferramenta, qualquer relatório rodando no mesmo schema.

## DBMS_APPLICATION_INFO: instrumentação sem saída de dados

Se você precisa saber o que está rodando *agora* — durante a execução, não depois — `DBMS_APPLICATION_INFO` é a peça que os padrões de saída acima não cobrem. Ele escreve metadados diretamente em `V$SESSION`.

```sql
PROCEDURE carregar_pedidos (p_lote_id IN NUMBER) AS
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('ETL_NOTURNO', 'Carregando pedidos');
  DBMS_APPLICATION_INFO.SET_CLIENT_INFO('Lote: ' || p_lote_id);

  -- trabalho de carga aqui

  DBMS_APPLICATION_INFO.SET_MODULE(NULL, NULL);
END;
```

Qualquer DBA com acesso a `V$SESSION` pode agora ver exatamente qual módulo e ação cada sessão está executando, sem que o procedure produza nenhuma saída. Para jobs de longa duração, é assim que você responde à pergunta "ainda está rodando, e em que ponto está?" sem precisar acompanhar um arquivo de log ou consultar tabelas da aplicação. Enterprise Manager, OEM Grid Control e o monitor de sessões do Veesker exibem `MODULE`, `ACTION` e `CLIENT_INFO` na lista de sessões ativas.

O overhead é praticamente zero: uma escrita em uma estrutura de memória compartilhada na SGA. Não há razão para não definir isso em todo ponto de entrada de procedure de nível superior.

## Compilação condicional: builds de debug sem código morto

A compilação condicional do Oracle, introduzida no 10g, permite definir seções de debug que são removidas completamente na compilação de produção. A sintaxe usa diretivas de consulta e o parâmetro de compilador `CC_FLAGS`.

```sql
CREATE OR REPLACE PROCEDURE processar_pedido (p_pedido_id IN NUMBER) AS
  v_total NUMBER;
BEGIN
  SELECT SUM(valor_linha) INTO v_total FROM linhas_pedido WHERE pedido_id = p_pedido_id;

  $IF $$DEBUG $THEN
    log_evento('PROCESSAR_PEDIDO', 'DEBUG',
      'p_pedido_id=' || p_pedido_id || ' v_total=' || v_total);
  $END

  -- resto do procedure
END;
```

Compilar sem a flag `DEBUG` faz o compilador PL/SQL eliminar aquelas linhas por completo. O binário de produção não carrega overhead algum da instrumentação. Recompilar com `ALTER PROCEDURE processar_pedido COMPILE PLSQL_CCFLAGS='DEBUG:TRUE'` ativa o logging imediatamente sem tocar no arquivo-fonte.

Isso é mais disciplinado do que alternar comentários ou usar o truque comum da variável de pacote `g_debug BOOLEAN := FALSE`, porque é uma garantia do compilador, não uma condição em tempo de execução. Também é mais explícito: alguém que lê o código seis meses depois vê um bloco de compilação condicional e entende imediatamente que é um caminho de diagnóstico, não lógica de produção.

## O que uma boa IDE contribui aqui

A maior parte do que foi descrito acima é Oracle padrão, documentado há décadas e disponível em todas as versões a partir do 10g. A diferença que uma IDE bem projetada faz não está no mecanismo, mas na visibilidade.

Com o painel de saída do Veesker ativo, as linhas de DBMS_OUTPUT aparecem à medida que cada instrução conclui — não acumuladas até o final do script. Consultas na tabela de log rodam como consultas rápidas inline contra a mesma conexão, com acesso por teclado a partir do procedure que você está editando. Os metadados da sessão em `V$SESSION` — incluindo `MODULE`, `ACTION` e `CLIENT_INFO` — aparecem no cabeçalho da aba de conexão, para que você veja o que uma sessão concorrente está fazendo sem precisar trocar de ferramenta.

Esses recursos não mudam o comportamento subjacente do Oracle. Eles reduzem o ciclo entre escrever uma instrução de log e ver o resultado, que é onde a maior parte do atrito real se concentra em uma sessão de depuração intensa.

A Community Edition é Apache 2.0 e gratuita para download em Windows, macOS e Linux. Funciona offline, nunca faz chamadas para casa e suporta do 9i ao 26ai no mesmo painel de conexões. Baixe em [veesker.cloud/download](/download) e tenha o quadro completo de logging na próxima vez que algo em PL/SQL der errado.

— *Veesker*
