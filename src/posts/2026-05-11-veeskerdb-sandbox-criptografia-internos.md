---
title: "Compartilhando dados de produção sem vazar: o design de criptografia do VeeskerDB Sandbox"
description: "Como o VeeskerDB Sandbox usa troca de chaves X25519 e ChaCha20-Poly1305 AEAD para compartilhar result sets Oracle entre colegas sem expor texto claro ao servidor de relay."
date: "2026-05-11"
slug: "veeskerdb-sandbox-criptografia-internos"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "seguranca", "criptografia", "sandbox"]
translation_slug: "veeskerdb-sandbox-encryption-internals"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

O momento mais perigoso no desenvolvimento Oracle raramente é uma query mal escrita. É o momento em que alguém precisa de dados de produção para reproduzir um bug.

A sequência é previsível. O bug só se manifesta com formatos específicos de dados. O desenvolvedor pede uma amostra. O DBA exporta um CSV do schema de produção. O CSV viaja por e-mail ou Slack. Cai em um notebook, é aberto no Excel, e três meses depois ninguém sabe mais quais serviços viram o arquivo em trânsito, onde ele foi parar, ou se foi excluído. Os dados que deveriam ajudar a corrigir um bug saíram silenciosamente de todas as fronteiras de governança que a organização julgava ter.

Isso não é um caso raro. É o fluxo padrão para equipes que não têm uma primitiva governada de compartilhamento de dados. A alternativa mais comum — um banco de dados de desenvolvimento próximo à produção, atualizado periodicamente — tem seus próprios problemas: dados desatualizados, divergência em relação às constraints de produção, e um ciclo completo de refresh toda vez que o schema muda.

O VeeskerDB Sandbox (previsto para o segundo semestre de 2026 como parte da camada Cloud do Veesker) foi projetado para este problema. O princípio central é que o servidor de relay — a infraestrutura da Veesker — nunca deve ter texto claro em nenhum ponto do caminho dos dados. Nem em memória, nem em logs, nem em buffers de trânsito. A criptografia é ponta a ponta, entre o desktop do remetente e o desktop do destinatário. As chaves para descriptografar nunca passam pelos nossos servidores.

Aqui está o design.

## O modelo de ameaça

Antes das primitivas, o modelo de ameaça. Do que exatamente a criptografia está se defendendo?

A preocupação principal não é um atacante que compromete o relay. A preocupação principal é o próprio relay: um serviço em nuvem operado por um fornecedor que não é a sua empresa, sujeito a ordens judiciais que você nunca verá, auditado por processos fora do seu controle, e administrado por engenheiros com acesso privilegiado. Mesmo um fornecedor totalmente confiável não pode garantir que uma ordem legal futura, um insider mal-intencionado, ou uma rotação de log mal configurada não vai expor dados que nunca pretendia reter.

A defesa prática contra esta categoria de risco é direta: o fornecedor nunca tem texto claro. Se o relay não consegue ler o conteúdo, não consegue vazar. Não há política, lista de controle de acesso, ou prática de gerenciamento de chaves mais simples do que "não temos a chave."

Uma preocupação secundária é o próprio caminho de rede. Criptografar o transporte com TLS protege contra interceptação entre cliente e relay, mas o TLS termina no relay — o servidor consegue ler tudo após o término da sessão TLS. A criptografia ponta a ponta fecha essa brecha: o que chega ao relay já é texto cifrado opaco, independentemente do que a camada de transporte faz.

## Troca de chaves X25519

X25519 é a função de Diffie-Hellman em curva elíptica de Bernstein, sobre a Curve25519. É a primitiva de troca de chaves no TLS 1.3, WireGuard e Signal. A razão pela qual é preferida ao ECDH clássico sobre curvas NIST em implementações preocupadas com segurança é parcialmente teórica e parcialmente prática: a Curve25519 é especificamente projetada para minimizar o risco de bugs de implementação. A multiplicação escalar roda em tempo constante por construção dos parâmetros da curva, não por virtude de codificação cuidadosa. O tamanho da chave é fixo em 32 bytes, tornando o manuseio de chaves trivialmente correto.

A troca no VeeskerDB Sandbox funciona assim. Tanto o remetente — a instância do Veesker desktop que cria o compartilhamento Sandbox — quanto o destinatário — a instância do Veesker desktop que o recebe — geram pares de chaves X25519 efêmeros. As chaves públicas são trocadas pelo relay. O relay vê as chaves públicas e nada mais. Cada parte computa independentemente o segredo compartilhado usando sua própria chave privada e a chave pública da outra parte. O resultado é idêntico em ambos os lados pela propriedade de Diffie-Hellman.

Pares de chaves efêmeros importam aqui. A chave privada do remetente é gerada do zero para cada compartilhamento Sandbox e descartada após o uso. Não há material de chave persistente em nenhum dos lados que, se comprometido em algum momento futuro, permitiria descriptografar compartilhamentos históricos. Esta propriedade é chamada de sigilo direto (forward secrecy): uma violação futura da máquina de qualquer das partes não expõe retroativamente o conteúdo do Sandbox do passado.

O segredo compartilhado de 32 bytes gerado pelo X25519 alimenta diretamente a cifra simétrica.

## ChaCha20-Poly1305

A camada de criptografia é ChaCha20-Poly1305, um esquema de criptografia autenticada com dados associados (AEAD) padronizado na RFC 8439. "Autenticado" é a palavra crítica. A cifra simultaneamente criptografa e autentica: a descriptografia falha explicitamente — com um erro explícito, não corrupção silenciosa — se qualquer bit do texto cifrado foi modificado em trânsito ou em repouso. Um relay que adultera um blob do Sandbox não produz saída corrompida. Produz uma falha de verificação. Armazenamento passivo e modificação silenciosa são ambos detectáveis.

ChaCha20 é uma cifra de fluxo; Poly1305 é um código de autenticação de mensagem. A combinação é usada em suites de cifra do TLS 1.3 e é a cifra de referência do WireGuard. É também notavelmente amigável para software. O AES-GCM atinge alto throughput em CPUs com instruções de hardware AES-NI — a maioria dos chips x86-64 modernos — mas em hardware sem essa aceleração, o AES-GCM em software é substancialmente mais lento. O ChaCha20-Poly1305 tem desempenho consistente em software em todas as gerações de hardware. Para uma aplicação desktop que precisa lidar com grandes result sets Oracle em hardware empresarial mais antigo, essa consistência importa.

Cada operação de criptografia usa um nonce de 96 bits gerado aleatoriamente. O nonce é incluído no envelope do texto cifrado para que o destinatário possa descriptografar corretamente. Nos volumes de dados envolvidos em compartilhamentos Sandbox, um espaço de nonce aleatório de 96 bits não cria risco prático de colisão.

## O que passa pelo relay

Um upload do VeeskerDB Sandbox é:

1. O result set Oracle serializado em um formato binário compacto.
2. Esse binário criptografado com ChaCha20-Poly1305 usando o segredo compartilhado derivado da troca X25519.
3. O texto cifrado enviado ao relay, marcado com um identificador opaco.

O relay armazena texto cifrado. Mantém o identificador opaco. Não possui o segredo compartilhado, porque o segredo compartilhado foi computado localmente a partir de material de chave que nunca saiu das respectivas instâncias desktop.

Quando o destinatário abre o compartilhamento, seu cliente Veesker busca o texto cifrado do relay usando o identificador e o descriptografa localmente com o segredo compartilhado derivado de forma independente. O relay vê o download de um blob opaco. O result set em texto claro é reconstituído na máquina do destinatário. Nunca existiu em forma descriptografável em nenhum outro ponto do caminho.

O que um log de rede da atividade do relay mostraria: identificadores de blob, contagem de bytes, timestamps. Nenhum nome de schema, nenhum valor de coluna, nenhum texto SQL, nenhum dado de linha.

## O que isso significa para conformidade

O design de criptografia importa mais em ambientes regulados. Organizações de saúde com bancos de dados Oracle contendo registros de pacientes. Instituições financeiras com dados de transação. Agências governamentais trabalhando com informações controladas. Para essas organizações, a pergunta de conformidade não é apenas "os dados estão criptografados em trânsito" mas "quem tem acesso teórico ao texto claro, e isso pode ser auditado."

Para o VeeskerDB Sandbox, a resposta é: a instância Veesker do remetente e a instância Veesker do destinatário. O operador do relay — a Veesker — possui texto cifrado, metadados sobre timing de transferência e tamanho do blob, e nada além disso. Essa resposta é auditável, explicável a um oficial de conformidade ou a um pentester, e não depende de confiar nas práticas internas da Veesker além de "eles não possuem a chave de descriptografia."

Isso é diferente da posição típica de SaaS empresarial, que é "criptografamos em repouso e em trânsito, e apenas funcionários autorizados podem acessar seus dados." Esta última é uma garantia de processo. O que estamos descrevendo é uma garantia criptográfica: a chave não existe na nossa infraestrutura, então os dados não podem ser lidos independentemente do que nossos processos afirmem.

## A base local-first

Uma razão pela qual esta arquitetura é viável é que o Veesker é local-first por design. A aplicação desktop não envia dados para casa. Credenciais ficam no chaveiro do sistema operacional — DPAPI no Windows, Keychain no macOS, Secret Service no Linux. A IDE principal funciona completamente offline. A camada Cloud, incluindo o VeeskerDB Sandbox, é uma extensão opt-in que adiciona um relay gerenciado, não um serviço hospedado do qual o desktop é um cliente leve.

Essa arquitetura significa que as operações criptográficas podem acontecer inteiramente dentro da aplicação desktop, onde as chaves residem. Uma ferramenta que precisasse de um componente server-side para funcionar teria que confiar ao servidor mais coisas — chaves, estado de sessão, contexto de schema. O servidor da Veesker é deliberadamente posicionado como um relay endereçado por conteúdo que move blobs, não um ambiente de computação que processa dados em nome dos clientes.

A Community Edition, disponível agora sob a licença Apache 2.0, oferece a IDE Oracle completa local-first — navegador de schema, editor PL/SQL, assistência de query com IA fundamentada no seu schema real e versão do servidor — sem nenhuma dependência de Cloud. O VeeskerDB Sandbox é um recurso da camada Cloud, e a camada Cloud é opt-in.

## Chegando no 2º semestre de 2026

O VeeskerDB Sandbox está em desenvolvimento. O design de criptografia descrito aqui reflete a arquitetura pretendida; detalhes específicos de implementação podem mudar antes da disponibilidade geral. Se você está avaliando ferramentas para uma equipe com requisitos rígidos de governança de dados e quer participar do design, a lista de espera é onde essa conversa está acontecendo.

O preço para fundadores está travado em $29 USD por assento por mês para membros da lista de espera.

**[Entre na lista de espera do Veesker Cloud](/#waitlist)** — e ajude a acertar o design de compartilhamento de dados antes do GA.

— *Veesker*
