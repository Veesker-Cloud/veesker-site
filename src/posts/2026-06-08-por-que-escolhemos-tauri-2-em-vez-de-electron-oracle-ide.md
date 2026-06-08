---
title: "Por que escolhemos Tauri 2 em vez de Electron para uma IDE Oracle"
description: "O Tauri 2 reduziu o instalador do Veesker a 12 MB, usa WebViews nativas do sistema operacional em vez de Chromium embutido, e delega operações sensíveis a um backend Rust que gerencia credenciais Oracle corretamente."
date: "2026-06-08"
slug: "por-que-escolhemos-tauri-2-em-vez-de-electron-oracle-ide"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "tauri", "electron", "desktop-apps", "developer-tools"]
translation_slug: "why-we-picked-tauri-2-over-electron-oracle-ide"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Construir uma ferramenta de desenvolvimento desktop em 2025 exigia tomar uma decisão arquitetural antes de qualquer outra coisa: como renderizar a interface? Widgets nativos — Qt, Win32, SwiftUI — são o ideal de performance e o pesadelo de manutenção. Um renderizador web é o ganho de produtividade e o passivo de implantação. No meio existe um terceiro caminho que se tornou genuinamente viável nos últimos dois anos: Tauri 2, que oferece a camada de interface web que você realmente quer usar, sustentada por um binário Rust que gerencia a integração com o sistema e as primitivas de segurança.

Electron foi a primeira consideração óbvia. É comprovado, bem documentado e funciona em tudo. O VS Code roda nele. O GitHub Desktop roda nele. O problema é que Electron embarca o Chromium — não "usa um navegador" de forma vaga, mas embarca uma cópia completa do Chromium dentro da sua aplicação, com seu próprio V8, seu próprio Node.js, sua própria árvore de processos. No macOS, um app Electron básico ocupa cerca de 180 MB instalado. Um app com qualquer conjunto de dependências relevante cruza os 200 MB sem muito esforço. Para um download passando pelo TI corporativo, isso é um obstáculo. Para desenvolvedores em conexões VPN lentas, é um teste de paciência.

O instalador do Veesker tem 12 MB nas três plataformas. Esse é o impacto real do Tauri, não um número de marketing. Eis como isso acontece.

## A WebView do sistema, não um navegador embutido

O Tauri 2 não embarca um navegador. Ele solicita ao sistema operacional uma WebView — WKWebView no macOS, WebView2 no Windows, WebKitGTK no Linux — e renderiza nela. Essas WebViews já estão na máquina como componentes do sistema. Sua aplicação não paga nenhum custo de download por elas.

A contrapartida é a consistência de renderização. Electron é Chromium em todo lugar: se algo renderiza corretamente no Chrome, renderiza corretamente no Electron. As três WebViews do Tauri não são o mesmo motor e não compartilham comportamento idêntico de CSS e JS. Encontramos isso com uma peculiaridade do `backdrop-filter` no WebKitGTK do Linux e uma inconsistência de formatação de datas no motor JS do Safari no macOS. Ambas foram correções de uma linha assim que identificadas.

Para uma ferramenta de desenvolvimento cujo espaço de superfície é principalmente tabelas, realce de sintaxe, editores de código e painéis, esse é um problema tratável. O risco de inconsistência é real, mas a superfície é muito menor do que seria para um app de consumo com animações ricas e layouts responsivos complexos. Entregamos UX funcionando nas três plataformas; os casos de borda são gerenciáveis, não são obstáculos intransponíveis.

## Modelo de processos e memória

O modelo de processos do Electron vem do Chromium: um processo principal, um ou mais processos de renderização, um processo de GPU, processos utilitários. Cada renderizador é isolado e se comunica com o processo principal via IPC. Com três abas de query e um navegador de schema abertos, você está olhando para quatro a seis processos dependendo da versão do Electron, e cada renderizador mantém seu próprio heap V8. Isso não é um defeito do Electron — é como o Chromium foi projetado, e o isolamento é justamente o objetivo — mas significa que a memória escala com o número de frames abertos tanto quanto com os dados sendo manipulados.

O modelo de processos do Tauri 2 é mais simples: um processo Rust que gerencia o backend, um processo WebView para a interface. O backend Rust trata todas as chamadas de sistema, I/O de arquivos, conexões com banco de dados e a superfície IPC que o frontend pode acessar. A WebView renderiza a aplicação React e envia comandos tipados pela ponte IPC. Não há runtime Node.js no lado de renderização. Se a interface precisar fazer algo que exija acesso elevado ou uma API nativa, ela chama um comando Tauri explicitamente definido — uma função Rust registrada na inicialização do app.

Para uma IDE com potencialmente uma dúzia de conexões Oracle abertas simultaneamente, cada uma sustentada por um pool de conexões OCI, o perfil de memória do backend é determinado pelo trabalho real: conexões ativas, resultados de queries em cache, metadados de schema. O frontend paga o custo do framework de UI e do estado. Os dois não compartilham um heap.

## Credenciais e a arquitetura de segurança

Todo desenvolvedor Oracle que usa o Veesker armazena credenciais em algum lugar. Strings de conexão, senhas, caminhos de wallet, senhas de wallet. O lugar correto para isso é o armazenamento de credenciais do SO — DPAPI no Windows, Keychain no macOS, Secret Service no Linux — não um arquivo JSON em texto claro no diretório da aplicação.

O Tauri 2 torna isso direto porque o backend é Rust. O crate `keyring` fornece uma abstração multiplataforma sobre os três repositórios do SO. As credenciais são gravadas no repositório do SO no momento de salvar a conexão e recuperadas no momento de abrir a conexão. A WebView nunca vê uma senha em texto claro — o comando Rust que abre uma conexão lê do repositório de credenciais e entrega o objeto de conexão OCI diretamente ao pool. A camada JS enxerga apenas um identificador de conexão e um status de sessão.

Em um modelo Electron, você pode alcançar algo semelhante com módulos nativos no processo principal, mas a arquitetura não empurra você nessa direção. O caminho natural no Electron é as credenciais viverem na memória do processo principal Node.js, acessíveis a partir de renderizadores se o isolamento de contexto não for mantido com cuidado. O Tauri 2 inverte isso: o backend Rust possui os segredos por design, e a WebView não pode cruzar essa fronteira sem um comando explicitamente registrado.

Para ambientes Oracle corporativos, essa arquitetura importa. Equipes de segurança revisando a ferramenta para aprovação têm um modelo claro para auditar: credenciais entram no repositório do SO via um comando Rust nomeado, saem do repositório do SO via um comando Rust nomeado, a camada web nunca as manipula diretamente. Essa é uma superfície auditável.

## Inicialização do Oracle Instant Client

Embutir o Oracle Instant Client — as bibliotecas compartilhadas que habilitam conexões OCI em modo Thick — exige que a aplicação resolva um caminho de biblioteca nativa na inicialização e chame a rotina de inicialização OCI antes que qualquer conexão seja tentada.

No Electron, isso significa contornar o formato de arquivo ASAR (que empacota arquivos do app e não funciona bem com carregamento de bibliotecas nativas), usar os helpers `app.getPath` do Electron para encontrar o diretório de recursos correto, e garantir que a inicialização OCI dispare a partir do processo principal antes que qualquer renderizador solicite uma conexão. É solucionável, mas exige cuidado.

No Tauri, o binário Rust executa a inicialização OCI na função principal antes de a WebView abrir. Não há ASAR, sistema de módulos ou JavaScript no caminho. O caminho da biblioteca é resolvido a partir da localização do executável e do diretório de recursos embutidos, o OCI inicializa, e toda conexão subsequente passa pelo modo Thick. O pool de conexões é uma struct Rust que possui o ambiente OCI e distribui conexões para comandos conforme necessário.

Essa é a arquitetura descrita em mais detalhe no [post sobre descoberta automática do modo Thick](/blog/oracle-9i-to-26ai-thick-mode-auto-discovery): a decisão de sempre usar modo Thick é aplicada no nível do binário, e a arquitetura do Tauri torna isso mais fácil de garantir do que a do Electron tornaria.

## O que realmente abrimos mão

A escolha pelo Tauri 2 não é isenta de custos. A lista honesta:

**O ecossistema npm no lado do backend.** Se uma biblioteca Node.js útil relacionada ao Oracle existisse e quiséssemos executá-la no lado servidor, ela não roda no backend do Tauri. Crates Rust são a história de pacotes do backend. Para as necessidades de uma ferramenta de desenvolvimento isso geralmente é suficiente, e para qualquer coisa relacionada a OCI os bindings Rust são sólidos — mas é uma restrição real se você planejava se apoiar no ecossistema Node.js para lógica de backend.

**Tamanho da comunidade.** Electron tem anos de soluções documentadas, palestras em conferências e respostas no Stack Overflow. Tauri 2 é mais recente e a comunidade é menor. Encontramos dois problemas não óbvios — um caso de borda na inicialização do WebView2 em instalações novas do Windows Server, e uma corrida na inicialização do ícone de bandeja no Linux — que levaram tempo para diagnosticar. As respostas existiam, mas encontrá-las exigiu mais pesquisa.

**Alguma previsibilidade de CSS.** A situação de WebView com múltiplos motores descrita acima é uma troca real, não uma nota de rodapé. Custou algumas horas de testes multiplataforma na build inicial e ocasionalmente aparece quando entregamos novos componentes de UI. O custo é gerenciável; não é zero.

## O resultado em números

O instalador do Veesker tem 12 MB. O tempo de inicialização a frio até a interface utilizável leva menos de dois segundos em uma máquina de especificação média. O consumo de memória com três conexões Oracle ativas e um navegador de schema aberto fica bem abaixo de 200 MB. Essas não são afirmações teóricas — refletem a versão atual em produção nas três plataformas.

As escolhas arquiteturais tornaram as coisas difíceis mais fáceis: armazenamento de credenciais, inicialização do modo Thick, uma fronteira de segurança limpa entre backend e frontend. A coisa fácil de que abrimos mão foi o Chromium embutido, e o custo de não tê-lo se revelou menor do que o custo de tê-lo.

O Veesker é gratuito para download sob Apache 2.0. A Edição Comunitária funciona totalmente offline — sem conta na nuvem obrigatória, sem telemetria, sem chamadas para casa. Se você gerencia um parque Oracle e quer uma ferramenta construída com esse cuidado pela arquitetura subjacente, [baixe o Veesker](/download).

— *Veesker*
