---
title: "Migrando pacotes PL/SQL legados para o APEX 24.x — um guia prático"
description: "Uma abordagem prática para expor lógica de negócio PL/SQL pelo APEX 24.x: o que migrar como está, o que reescrever e onde a IA ajuda ou atrapalha."
date: "2026-05-18"
slug: "migrando-pacotes-plsql-para-apex-24"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "apex", "migracao", "ferramentas-dev"]
translation_slug: "migrating-plsql-packages-to-apex-24"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

A maioria dos ambientes Oracle tem uma forma reconhecível: um núcleo de pacotes PL/SQL escritos entre dez e vinte anos atrás, carregando lógica de negócio validada que ninguém quer arriscar reescrever do zero. Motores de cálculo de pedidos. Rotinas de apuração tributária. Lógica de alocação de estoque. Os pacotes funcionam. Passam em auditorias. E são completamente invisíveis para qualquer coisa fora da sessão Oracle que os chama.

O APEX 24.x não pede que você abandone essa lógica. Ele pede que você a exponha — com cuidado, com fronteiras claras entre o que fica no PL/SQL e o que sobe para a nova camada. Essa é uma demanda fundamentalmente diferente de uma migração para um microsserviço Java ou uma reescrita em Python. O banco de dados continua sendo o sistema de registro e a camada de computação. O APEX se torna a superfície.

## O que o APEX 24.x adiciona ao kit de migração

Três capacidades da linha 24.x mudam materialmente o cálculo da migração.

**Habilitação automática REST via ORDS.** O Oracle REST Data Services, que vem com o APEX 24.x, pode habilitar automaticamente procedures e funções armazenadas como endpoints REST. Uma procedure que recebe um ID de cliente e retorna um resultado JSON pode ser exposta como endpoint GET em minutos, não dias. O resultado não está pronto para produção por padrão — ainda é preciso controlar quais parâmetros são expostos, adicionar autenticação e tratar propagação de erros — mas oferece um caminho rápido para testar a procedure via HTTP antes de construir as páginas APEX.

**APEX_EXEC para invocação PL/SQL na página.** A API `APEX_EXEC` permite chamar uma procedure PL/SQL armazenada a partir de um processo APEX sem escrever um wrapper AJAX customizado. Para procedures que precisam de contexto de sessão — usuário atual, idioma da aplicação, valores de itens — o `APEX_EXEC` cuida da infraestrutura. O padrão de migração é: mantenha a procedure do pacote como está, adicione um processo APEX fino que a chama via `APEX_EXEC`, passe os valores dos itens como bind parameters. O código original não é tocado. O conjunto de testes original continua rodando.

**Exposição estruturada de erros no Page Designer.** O APEX 24.x melhorou a exibição de exceções PL/SQL não tratadas no nível da página. Uma abordagem de migração mais antiga engolia exceções dentro de um tratador genérico e retornava um HTTP 500 em branco. Os novos hooks de tratamento de erros oferecem uma forma estruturada de traduzir códigos `ORA-xxxxx` em mensagens para o usuário final sem instrumentar cada chamador.

## Quatro padrões de migração

### 1. Procedure como processo (sem novo SQL)

O caso mais simples. Você tem uma procedure que executa ações e não retorna valor — ela grava em uma tabela de log, envia uma notificação, atualiza uma coluna de status.

```sql
-- Procedure existente, sem alteração
PROCEDURE mark_order_complete(p_order_id IN NUMBER) IS
BEGIN
  UPDATE orders SET status = 'COMPLETE', completed_at = SYSDATE
  WHERE order_id = p_order_id;
  order_audit.log('COMPLETE', p_order_id,
                  SYS_CONTEXT('USERENV', 'SESSION_USER'));
  COMMIT;
END;
```

No APEX, crie um Page Process do tipo "PL/SQL Code" na página relevante. O corpo é uma única chamada:

```plsql
order_pkg.mark_order_complete(p_order_id => :P10_ORDER_ID);
```

`:P10_ORDER_ID` é um item de página. O APEX faz o bind antes da execução. A procedure original não é alterada. Nenhum ORDS necessário. Este padrão cobre uma grande fração das procedures de "ação" na maioria dos pacotes.

### 2. Função como computação (resultado em item de página)

Uma função de pacote retorna um valor escalar — um preço calculado, uma string formatada, um código de status. Você quer que esse valor preencha um item de página.

```plsql
-- Em um processo Before Header ou Dynamic Action:
:P10_COMPUTED_PRICE := pricing_pkg.calculate_price(
  p_product_id  => :P10_PRODUCT_ID,
  p_quantity    => :P10_QUANTITY,
  p_customer_id => :P10_CUSTOMER_ID
);
```

Bind parameters de entrada, bind variable de saída. Sem função wrapper. Sem alteração de DDL. O pacote de precificação não sabe que o APEX existe.

### 3. Procedures com REF CURSOR expostas via APEX_EXEC

Procedures que retornam `SYS_REFCURSOR` são comuns em pacotes mais antigos — elas foram criadas antes das regiões de query SQL e foram projetadas para alimentar telas de relatório. O `APEX_EXEC` pode abrir e iterar um cursor:

```plsql
DECLARE
  l_context APEX_EXEC.t_context;
BEGIN
  l_context := APEX_EXEC.open_cursor(
    p_sql             => 'BEGIN order_pkg.get_orders_for_customer'
                      || '(:p_cust_id, :p_cursor); END;',
    p_auto_bind_items => true
  );
  -- APEX renderiza o result set através do handle de contexto
  APEX_EXEC.close(l_context);
END;
```

Isso funciona para fontes de Classic Report e Interactive Grid onde a procedure original retorna exatamente as colunas que a região precisa. Quando as colunas não correspondem, você enfrenta uma refatoração real — a assinatura do cursor precisa mudar, o que significa alterar a spec do pacote. Essa é a linha onde "expor como está" vira "reescrever".

### 4. Blocos de transação autônoma

Um modo de falha sutil: procedures que declaram `PRAGMA AUTONOMOUS_TRANSACTION` para log de auditoria podem gerar deadlock ou sessões pendentes quando chamadas dentro de uma transação APEX que ainda não foi confirmada. A solução não é remover a transação autônoma — ela existe por um motivo — mas estruturar a página APEX para que a transação externa faça commit ou rollback antes que a procedure de auditoria dispare. O sequenciamento de processos no Page Designer do APEX controla isso. A ordem dos processos Before Submit e After Submit importa mais do que a maioria dos desenvolvedores espera quando há transações autônomas envolvidas.

## Onde a IA ajuda — e onde não ajuda

A migração assistida por IA de pacotes PL/SQL é genuinamente útil em aspectos específicos e genuinamente perigosa em outros.

**Útil: gerar stubs de processo APEX.** Dado um spec de pacote, um modelo consciente do schema consegue produzir a chamada `APEX_EXEC` correta, os nomes certos dos bind parameters e um esboço de tratamento de erros. Um trabalho que levava vinte minutos de copiar e colar e correspondência manual de parâmetros leva menos de dois minutos.

**Útil: auditar estado global de pacotes.** Muitos pacotes mais antigos usam variáveis em nível de pacote como forma de estado de sessão — `pkg.g_current_user`, `pkg.g_run_mode`. Essas variáveis são reinicializadas na reconexão da sessão e não têm significado no modelo de requisição de página sem estado do APEX. Um modelo que consegue ler o corpo completo do pacote pode sinalizar toda referência a um global de pacote e estimar o escopo da refatoração antes de você se comprometer com ela.

**Perigoso: deixar o modelo reescrever lógica de negócio PL/SQL sem revisão humana.** O modelo não conhece seus dados. Ele não sabe o que `order_audit.log` realmente confirma, se `SYSDATE` aqui é ajustado por um offset de fuso horário mais adiante, ou se `pricing_pkg` tem uma dependência de database link que não existirá no contexto do APEX. Mudanças de superfície — stubs, wrappers de binding, tratadores de erro — são seguras para automatizar. Mudanças de lógica exigem um humano que entende o domínio.

A IA com consciência de schema do Veesker lê as specs e corpos dos seus pacotes localmente — por padrão, não os envia para um serviço remoto. Você obtém geração de stubs e auditoria de estado global sem o schema sair do ambiente. A camada Cloud (chegando no 2S 2026) adiciona um ciclo de feedback: saída do `EXPLAIN PLAN` retroalimentada no modelo para que reescritas sejam medidas pelo veredicto do otimizador, não por uma heurística.

## Faseando o trabalho

Uma sequência prática para um projeto realista de migração de pacotes:

**Inventário primeiro.** Conte procedures e funções de pacotes. Classifique cada uma como ação (sem retorno), computação (retorno escalar) ou dado (retorno de cursor). A distribuição indica quanto ORDS você precisa versus quanto é trabalho puro de processo APEX.

**Congele as specs dos pacotes.** Assim que você começar a conectar o APEX a um pacote, a spec é uma API pública. Mudar a lista de parâmetros de uma procedure significa atualizar todo processo APEX que a chama. Fixe as assinaturas antes de começar a conectar.

**Conecte caminhos de leitura antes dos de escrita.** Regiões de relatório e itens Display Only carregam menor risco do que processos que fazem UPDATE ou DELETE. Construa confiança nos padrões de chamada antes de expor mutações.

**Execute o conjunto de testes original a cada passo.** Os pacotes em si não mudaram; os testes existentes ainda devem passar. Se não passarem, a conexão introduziu um efeito colateral — e você quer saber isso antes de publicar a página APEX.

**Adie os casos difíceis deliberadamente.** Transações autônomas, estado de pacotes entre sessões, database links, chamadas de procedimento externo — esses são problemas de engenharia reais que merecem sprints dedicados, não correções de última hora. Nomeie-os explicitamente no seu backlog. "Não vamos migrar `external_pkg` nesta fase" é uma decisão de projeto válida e honesta.

O princípio do guia prático é o mesmo de qualquer migração: reduza o que reescreve, exponha o que já funciona e seja honesto sobre a complexidade que está adiando.

---

Baixe o Veesker para navegar pelo inventário de pacotes, rastrear dependências de chamadas e obter assistência de IA com consciência de schema para PL/SQL — localmente, sem o schema sair do ambiente: [veesker.cloud/download](/download).

— *Veesker*
