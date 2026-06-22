---
title: "Auto-documentando 1000 Pacotes PL/SQL Durante a Noite — Notas de Design"
description: "Como o pipeline com consciência de schema do Veesker extrai contexto do dicionário de dados, resolve dependências e gera documentação PL/SQL revisável em escala."
date: "2026-06-22"
slug: "auto-documentando-pacotes-plsql-durante-a-noite"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "plsql", "documentacao", "ai", "ferramentas-desenvolvimento"]
translation_slug: "auto-documenting-plsql-packages-overnight"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

A maioria dos bases de código Oracle com mais de cinco anos compartilha a mesma história de documentação: não existe nenhuma, ou o que existe está errado, ou vive em um documento Word que foi aberto pela última vez quando o Oracle 11g ainda era novo. Pacotes PL/SQL se acumulam ao longo de anos de pressão de produção. Uma procedure que começou com dez linhas ganha mais três parâmetros, uma bifurcação condicional para um caso especial, duas correções de bugs sem comentário e um `--TODO` de 2019. A interface muda. O desenvolvedor original foi embora. A documentação, se alguma vez foi escrita, agora é um passivo.

Documentar em lote uma base de código com mil pacotes não é um problema criativo — é um problema de engenharia. O desafio não é "a IA consegue escrever boa documentação" mas "como você fundamenta a IA com contexto suficiente para que a documentação produzida seja de fato correta." Este post cobre o raciocínio de design por trás do recurso de auto-documentação do Veesker, que faz parte da camada Cloud com lançamento previsto para o segundo semestre de 2026.

## A abordagem ingênua e por que ela falha

A abordagem ingênua: pegar cada pacote, despejar o texto-fonte em um prompt, pedir ao modelo a documentação.

Isso funciona para exemplos simples. Quebra em bases de código Oracle reais por razões previsíveis.

**A IA não tem contexto de schema.** Um parâmetro chamado `p_cust_id NUMBER` pode ser uma chave primária, uma chave substituta de uma sequência legada ou um identificador externo que foi renomeado três vezes. Sem a definição real da coluna — sua constraint, seu relacionamento de chave estrangeira, o que ela referencia em `CUSTOMERS` — a IA vai adivinhar. A adivinhação vai errar em uma fração significativa das vezes, e quando a documentação está errada, ela é pior do que ausente.

**Pacotes PL/SQL rotineiramente referenciam objetos que a IA não pode ver.** O corpo de um pacote chama `audit_pkg.log_event` e faz joins em quatro database links. A assinatura que a IA recebe não é o comportamento que o código de fato tem. Documentar comportamento a partir da interface isolada produz documentação que é localmente plausível, mas globalmente enganosa.

**Corpos de pacotes grandes excedem janelas de contexto úteis.** Um `PACKAGE BODY` com quarenta procedures, cada uma com 200 linhas, são 8.000 linhas de PL/SQL. A estrutura importante — quais procedures chamam quais, quais são wrappers públicos e quais são implementação privada — se comprime em ruído na escala.

**Definições de tipo vivem na spec do pacote, mas seu significado semântico vive no banco de dados.** Um parâmetro `%ROWTYPE` tem um significado específico. A IA precisa ver a definição real da linha para documentá-lo com precisão.

Nenhum desses é um problema com o modelo de IA. São problemas de montagem de contexto. A solução não é um modelo melhor — é um pipeline melhor.

## O que o pipeline faz em vez disso

O pipeline de documentação começa antes que a IA toque um único caractere de PL/SQL. Ele opera em três fases: extração de schema, resolução de dependências e geração em lote.

**Extração de schema** lê primeiro o dicionário de dados: `ALL_ARGUMENTS`, `ALL_PROCEDURES`, `ALL_OBJECTS`, `ALL_DEPENDENCIES`, `ALL_TYPES`, `ALL_TAB_COLUMNS`. Para cada pacote, monta uma representação estruturada da interface do pacote — nomes de procedures, nomes de parâmetros, direções dos parâmetros, tipos de dados resolvidos para seu tipo base (sem aliases `%TYPE` que exigem outra consulta) e quaisquer constraints documentadas em `ALL_COL_COMMENTS`. Essa representação é compacta. Um pacote com vinte procedures se torna algumas centenas de tokens, não milhares de linhas de código-fonte.

**Resolução de dependências** traça um nível de chamadas de saída: quais outros pacotes este chama? Quais tabelas ele lê e escreve? Isso não é resolução transitiva completa — esse caminho leva a trabalho O(n²) em bases de código grandes — mas um nível geralmente é suficiente para responder à pergunta "o que este pacote realmente toca." O grafo de dependências molda a documentação: um pacote que só lê é documentado de forma diferente de um que detém escritas, exclusões e chamadas externas.

**Geração em lote** agrupa pacotes por tamanho e complexidade, então envia prompts estruturados ao modelo com o contexto extraído anexado. O prompt não é "aqui está o código-fonte, escreva documentação." É "aqui está a interface, aqui estão os tipos de parâmetros resolvidos, aqui está o que este pacote chama, aqui estão os dados que ele lê — escreva documentação para um desenvolvedor Oracle sênior que usará isso para entender a base de código sem ler cada body." Essa restrição — "desenvolvedor sênior, compreensão da base de código" — é significativa. Ela desencoraja a IA de preencher com observações óbvias e a empurra em direção às não óbvias.

O formato de saída é instruções DDL `COMMENT ON PROCEDURE` e `COMMENT ON FUNCTION`, mais um cabeçalho a nível de pacote. Eles podem ser revisados como um diff, aplicados ao schema alvo e capturados por `ALL_PROCEDURES` e extratores de documentação padrão do Oracle.

## O que torna a documentação PL/SQL diferente

Documentação PL/SQL não é como documentar uma função Python. Algumas coisas que importam.

**Comportamento de exceção é documentação essencial.** Uma procedure que levanta `NO_DATA_FOUND` em condições específicas e a trata internamente é fundamentalmente diferente de uma que a deixa propagar. Os chamadores precisam saber qual é qual. Isso não é visível na assinatura e é genuinamente difícil de inferir somente do código-fonte. O pipeline sinaliza procedures com `EXCEPTION WHEN OTHERS THEN NULL` — um padrão comum de supressão silenciosa de erros — e as nota explicitamente na documentação gerada.

**Saída de cursor é a interface real para pacotes de relatório.** Muitos pacotes Oracle legados têm procedures que abrem um `SYS_REFCURSOR` e retornam um result set. A documentação para essas procedures só é útil se descrever quais colunas o cursor retorna. Isso não está na spec. O pipeline lê a instrução `SELECT` do body (quando acessível) e descreve a projeção explicitamente.

**Procedures sobrecarregadas exigem desambiguação.** O Oracle permite sobrecarga de procedures dentro de um pacote. Um pacote pode ter três procedures `GET_ACCOUNT` com listas de parâmetros diferentes. O motor de documentação lida com cada sobrecarga separadamente e inclui a assinatura de parâmetros no cabeçalho da documentação para tornar a desambiguação inequívoca.

## A parte "durante a noite"

O enquadramento "1000 pacotes durante a noite" não é metafórico. Com a abordagem em lote da camada Cloud, um schema com mil pacotes processa em algumas horas com custos de API em horário de pico baixo. O agendamento noturno é deliberado — a geração de documentação com consciência de schema envolve um número significativo de leituras de banco de dados e chamadas de API. Mantê-lo como um job em segundo plano evita interromper o dia de desenvolvimento.

O pipeline respeita limites de taxa em ambas as extremidades: pool de conexões Oracle no lado do banco de dados, concorrência configurável no lado da API. Schemas maiores podem ser divididos em execuções incrementais diárias — documentando os pacotes que mudaram desde a última execução em vez do catálogo completo a cada vez.

## A etapa de revisão

O design não pressupõe que a documentação gerada está correta. O fluxo de trabalho é:

1. Gerar o lote completo de documentação durante a noite.
2. Exibir uma interface de revisão mostrando cada doc gerado ao lado do código-fonte original.
3. Permitir que a equipe aprove, edite ou rejeite por pacote, com o conjunto aprovado aplicado como uma migração DDL.

A interface de revisão importa mais do que a etapa de geração. Documentação que não pode ser revisada não será confiável. Documentação que não pode ser editada não será mantida atualizada. O fluxo de trabalho Cloud é construído em torno da premissa de que a IA produz um rascunho, não uma resposta final. A equipe é dona do resultado.

Isso é consistente com a forma como o Veesker aborda recursos de IA em geral. O modelo é fundamentado no seu schema, na sua versão Oracle, no seu dicionário de dados — ele não alucina nomes de tabelas nem inventa semântica de parâmetros. Mas ainda é inferência, não certeza. A revisão humana antes do commit é a arquitetura correta.

## Local-first, Cloud opcional

Os componentes de extração de schema e resolução de dependências são construídos sobre a mesma leitura do dicionário de dados que alimenta o schema browser existente na Community Edition. Essa camada roda localmente, contra sua própria conexão Oracle, e nunca envia metadados de schema para lugar algum sem seu opt-in. O pipeline de geração em lote e a interface de revisão são recursos Cloud — eles requerem o serviço gerenciado para coordenar as chamadas de API e armazenar o estado de revisão.

A Community Edition hoje oferece o schema browser, o editor SQL, execução PL/SQL e a camada de IA local fundamentada no seu schema. O recurso de auto-documentação estende isso com um pipeline coordenado pela Cloud para escala. Mesma postura local-first, mesmo modelo de segurança — a Cloud é uma camada opcional, não um pré-requisito.

---

Se você gerencia uma grande base de código PL/SQL e a dívida de documentação está desacelerando o onboarding ou a resposta a incidentes, é esse o problema que o Veesker Cloud foi projetado para resolver.

**[Entre na lista de espera do Cloud](/#waitlist)** — preço de fundador bloqueado em $29 USD por assento por mês para membros da lista de espera. Lançamento geral no segundo semestre de 2026.

— *Veesker*
