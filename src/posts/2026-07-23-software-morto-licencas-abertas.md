---
title: "Software morto e licenças abertas: o que você deve às pessoas que construíram fluxos de trabalho na sua ferramenta"
description: "Quando uma ferramenta para desenvolvedores morre, uma licença aberta não é caridade — é o mínimo que você deve a cada desenvolvedor que construiu fluxos de trabalho na sua promessa de longevidade."
date: "2026-07-23"
slug: "software-morto-licencas-abertas"
lang: "pt"
kind: "manifesto"
tags: ["open-source", "ferramentas-para-desenvolvedores", "licenciamento", "sustentabilidade"]
translation_slug: "dead-software-open-licenses"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

Há uma crueldade específica na morte de uma ferramenta fechada para desenvolvedores.

Não no sentido agudo — ninguém pretendeu causar dano — mas no sentido estrutural. Você construiu seu pipeline de exportação em cima dela. Escreveu duas mil linhas de macros que invocam sua API. Treinou seu desenvolvedor júnior nos seus atalhos. E então a empresa por trás dela pivotou, foi adquirida, ou simplesmente parou de entregar atualizações. A ferramenta apodreceu. O servidor de licenças saiu do ar. O site do fornecedor ficou no ar por dezoito meses até que alguém esqueceu de renovar o domínio.

E você ficou com fluxos de trabalho que não funcionam mais, em um formato que ninguém consegue ler.

Isso não é raro. É o resultado padrão de ferramentas fechadas para desenvolvedores. A maioria morre. A maioria morre sem te deixar nada de útil no caminho.

## O que você realmente deve

Se você distribui uma ferramenta para desenvolvedores e algum dia pretende parar de mantê-la — o que, eventualmente, todo fornecedor faz — você deve acesso ao código-fonte sob uma licença aberta para seus usuários. Só isso. Não um guia de migração. Não um serviço hospedado de exportação. Não um post no blog explicando o pivô. **Código-fonte, Apache 2.0 ou equivalente, onde eles possam fazer fork, manter e adaptar.**

Uma licença aberta não é caridade. É o único reconhecimento honesto de que seus usuários construíram coisas reais em cima do seu software, e que o investimento deles na sua ferramenta sobrevive à sua disposição de mantê-la.

Uma licença fechada, quando o produto morre, é uma transferência silenciosa de risco. Você ficou com a receita das assinaturas. Manteve o código-fonte. E quando foi embora, deixou-os com nada que pudessem corrigir.

## A versão desse problema para o DBA Oracle

O ecossistema de ferramentas Oracle está repleto exatamente desse padrão. Ferramentas que dominaram a categoria em 2008 e ainda rodam em máquinas hoje porque a migração é cara demais. Macros escritas em linguagens de script proprietárias sem especificação pública. Perfis de conexão em formatos que só um binário consegue ler.

Se esse binário parar de rodar em um sistema operacional atual, as opções são: encontrar uma máquina antiga, rodar uma VM, ou reescrever do zero. Milhares de horas de automação acumulada, e o único caminho adiante é a reconstrução.

É isso que "confiei meus fluxos de trabalho à sua ferramenta" significa na prática. Não uma relação abstrata com um fornecedor. Macros reais. Templates reais. Artefatos reais de treinamento. Custo real.

## A saída responsável

A resposta é direta. Se você constrói uma ferramenta para desenvolvedores — especialmente uma que acumula configurações, scripts ou fluxos de trabalho criados pelos usuários — projete sua licença pensando na saída. Apache 2.0 significa que quando você parar de se importar com o código, outra pessoa pode. MIT significa o mesmo. AGPL significa o mesmo, com trade-offs diferentes.

"Podemos abrir o código se a comunidade crescer" não é um plano. É um adiamento que nunca se resolve, porque a comunidade não consegue crescer sem a confiança de que esse adiamento tem fim.

A Veesker distribui a Community Edition sob Apache 2.0 desde o primeiro dia. Não porque isso garanta o sucesso da empresa — nenhuma licença garante — mas porque as pessoas que constroem fluxos de trabalho Oracle com a Veesker merecem poder ler, modificar e fazer fork da ferramenta da qual dependem. Se a Veesker algum dia parar de ser mantida, o código já está disponível. Esse é o acordo.

Todo fornecedor de ferramentas para desenvolvedores deveria deixar isso claro desde o início. A maioria não deixa. Deveria.

---

Se você mantém automação Oracle que não pode se dar ao luxo de perder para um pivô de fornecedor, baixe a Veesker: [veesker.cloud/download](/download).

— *Veesker*
