---
title: "Como o Veesker gerencia arquivos Oracle wallet: OCI, mTLS e a conexão com a nuvem"
description: "Um guia prático sobre autenticação com Oracle wallet — cwallet.sso, ewallet.p12, mTLS e como o Veesker armazena credenciais sem tocar em arquivos de configuração em texto simples."
date: "2026-07-06"
slug: "oracle-wallet-oci-mtls-conexao-cloud"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "wallet", "oci", "mtls", "seguranca"]
translation_slug: "oracle-wallet-oci-mtls-cloud-connection"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Se você já conectou ao Oracle Cloud Database ou a um banco de dados local protegido por uma política de firewall com TLS mútuo, sabe o que é um Oracle wallet. Trata-se de um diretório — normalmente entregue como um arquivo ZIP — contendo dois arquivos principais: `cwallet.sso` (login automático) e `ewallet.p12` (PKCS12 protegido por senha). Adicione um `tnsnames.ora` e um `sqlnet.ora`, e você tem tudo o que o cliente Oracle precisa para negociar uma sessão autenticada e criptografada.

A maioria das IDEs Oracle trata o wallet como um detalhe secundário. Você cola um caminho, torce para o cliente encontrá-lo e passa horas depurando erros de TNS que podem ou não ter relação com o wallet. O Veesker foi projetado desde o início para tratar conexões baseadas em wallet como um fluxo de trabalho de primeira classe, não como uma nota de rodapé.

Este post aborda o que os Oracle wallets realmente contêm, por que o mTLS importa mesmo em redes internas, como o Veesker armazena e passa credenciais de wallet para o OCI, e como é o processo ao conectar ao Oracle Autonomous Database no OCI.

## O que há dentro de um Oracle wallet

Os Oracle wallets são pacotes de credenciais no formato padrão Oracle — SSO ou PKCS12. Um ZIP de wallet cloud típico contém:

```
cwallet.sso       — Arquivo SSO de login automático do Oracle; sem prompt de senha, o cliente autentica diretamente
ewallet.p12       — Repositório de certificados PKCS12, protegido por senha
tnsnames.ora      — Descritores de conexão para os serviços TNS do banco de dados
sqlnet.ora        — Configuração do SQLNet, incluindo caminho do wallet e configurações SSL
ojdbc.properties  — Configuração JDBC, relevante para clientes Java
```

Quando o Oracle Client (OCI) inicializa uma conexão, ele lê o `sqlnet.ora` para localizar o diretório do wallet. O `sqlnet.ora` em um wallet Oracle Cloud padrão se parece com:

```ini
WALLET_LOCATION = (SOURCE = (METHOD = file)(METHOD_DATA = (DIRECTORY = "?/network/admin")))
SSL_SERVER_DN_MATCH = yes
```

O `?` é um marcador de posição para o Oracle Home ou, em implantações de Instant Client, o diretório que a ferramenta resolve como equivalente. É aqui que a maioria das falhas do lado do cliente se origina: o marcador resolve para o local errado, os arquivos do wallet não são encontrados, e a superfície de erro é uma falha de handshake SSL ou um timeout genérico no nível do TNS.

## Por que mTLS e não apenas TLS

O TLS padrão autentica o servidor. O cliente verifica o certificado do servidor em relação a uma raiz confiável, decide que o servidor é quem diz ser e prossegue. A maior parte do tráfego web funciona assim.

O TLS mútuo (mTLS) adiciona a direção oposta: o servidor também valida o certificado do cliente. Para uma conexão de banco de dados, isso significa que mesmo que um atacante capture o caminho de rede entre seu cliente e o listener Oracle, apresentar uma credencial válida exige a chave privada dentro do wallet — não apenas um nome de usuário e senha.

No Oracle Cloud (OCI), todas as conexões com Autonomous Database são mTLS por padrão. O wallet é o mecanismo: `cwallet.sso` contém a chave privada e o certificado do cliente, e o listener OCI valida esse certificado em relação à autoridade certificadora do tenant antes de negociar a sessão. Sem wallet, sem conexão — independentemente de a senha estar correta.

Algumas organizações estenderam o mesmo padrão a ambientes locais usando listeners SSL habilitados do Oracle e CAs privadas. Os arquivos do wallet nesse caso vêm do PKI corporativo em vez do OCI, mas a estrutura e o comportamento do cliente são idênticos.

## Como o Veesker armazena credenciais de wallet

O perfil de conexão do Veesker armazena o caminho do diretório do wallet junto com os detalhes da conexão. É tudo o que é necessário: um caminho para o diretório contendo `cwallet.sso` e `ewallet.p12`, e opcionalmente uma senha do wallet para o arquivo p12 caso você não esteja usando o login automático.

Esse caminho do wallet e qualquer senha associada nunca ficam em um arquivo de configuração em texto simples. O Veesker usa o repositório de credenciais do sistema operacional em todas as plataformas suportadas:

- **Windows:** Windows Data Protection API (DPAPI), o mesmo mecanismo usado pelo Credential Manager e pelos repositórios de senhas de navegadores.
- **macOS:** Keychain, o repositório de credenciais do sistema com suporte a enclave seguro.
- **Linux:** libsecret / Secret Service API, que suporta GNOME Keyring e KDE Wallet.

A consequência: se você exportar suas configurações do Veesker para um arquivo e compartilhar com um colega, o caminho do wallet é exportado (não é sensível), mas a senha do wallet não viaja junto. Não há nenhuma credencial em texto simples no disco.

## Passando o wallet para o OCI

Quando o Veesker abre uma conexão que inclui um caminho de wallet, ele constrói o bloco de parâmetros OCI com as adições SSL necessárias. Um descritor de conexão para Oracle Autonomous Database se parece com:

```
MY_DB =
  (DESCRIPTION =
    (ADDRESS = (PROTOCOL = TCPS)(HOST = adb.region.oraclecloud.com)(PORT = 1522))
    (CONNECT_DATA = (SERVICE_NAME = my_db_high.adb.oraclecloud.com))
    (SECURITY = (SSL_SERVER_CERT_DN = "CN=adwc.uscom-east-1.oraclecloud.com,OU=Oracle BMCS US,O=Oracle Corporation,L=Redwood City,ST=California,C=US")))
```

A localização do wallet e a configuração `ssl_server_dn_match` são passadas programaticamente para a biblioteca OCI em vez de serem gravadas em um `sqlnet.ora` temporário. O diretório do wallet nunca é copiado ou modificado. O OCI lê a partir do caminho original e realiza as operações de certificado na memória.

Uma implicação prática: se você tiver múltiplas conexões com Autonomous Database apontando para tenants diferentes, cada uma terá seu próprio caminho de wallet em seu próprio perfil de conexão. Não há nenhuma configuração global de wallet para gerenciar.

## O formato EZConnect+ para wallets OCI

A Oracle introduziu o formato EZConnect+ em versões mais recentes do Oracle Client para permitir a especificação do wallet diretamente na string de conexão:

```
tcps://adb.region.oraclecloud.com:1522/my_db_high.adb.oraclecloud.com?wallet_location=/caminho/para/wallet&ssl_server_dn_match=yes
```

O Veesker suporta strings EZConnect+ no formulário de conexão avançada. Para conexões cloud especificamente, o fluxo mais simples é o campo de diretório do wallet no perfil de conexão padrão: descompacte o wallet em um diretório local, cole o caminho e o Veesker monta os parâmetros OCI. As duas abordagens funcionam.

## E as conexões sem wallet

Nem toda conexão Oracle exige um wallet. Conexões locais padrão via TCP (não TCPS) autenticam por nome de usuário e senha, com criptografia de rede gerenciada pelo Oracle Net encryption ou TLS no listener. O Veesker suporta ambas. O campo de diretório do wallet em um perfil de conexão é opcional. Se estiver vazio, o OCI negocia a sessão sem autenticação de cliente baseada em wallet.

A distinção importa para ambientes mistos. Um banco de dados 11g local em uma rede interna tipicamente usará uma conexão TCP direta. Um Oracle Autonomous Database no OCI exige TCPS e um wallet. Um 19c primário com um standby de Data Guard protegido por política TLS corporativa pode usar qualquer um, dependendo de como o listener foi configurado. O Veesker permite configurar a combinação certa por conexão em vez de impor uma política global.

## A história da conexão com a nuvem (chegando no 2º semestre de 2026)

O Veesker Cloud — a camada gerenciada construída sobre a IDE local-first — adiciona um caso de uso específico: compartilhar configurações de conexão entre uma equipe sem compartilhar credenciais.

O design espelha a abordagem usada para o VeeskerDB Sandbox: os metadados de conexão (host, nome do serviço, caminho do wallet relativo à máquina do desenvolvedor) são armazenados e opcionalmente sincronizados, mas as credenciais permanecem no chaveiro do sistema operacional local de cada desenvolvedor. Um administrador de equipe pode compartilhar um modelo de conexão que inclui tudo, exceto os segredos. Cada desenvolvedor adiciona suas próprias credenciais localmente.

O fluxo de trabalho completo da equipe — incluindo pools de conexão gerenciados centralmente e aplicação de políticas para timeouts de consulta gerados automaticamente e guardas de modo somente leitura — está em desenvolvimento ativo como parte do GA do Cloud (2º semestre de 2026). O padrão de isolamento de credenciais locais já está na atual Community Edition e não requer que a camada Cloud esteja habilitada.

## Depurando falhas de conexão relacionadas ao wallet

Quando uma conexão baseada em wallet falha, a cadeia de erros é geralmente uma de três coisas.

**Caminho do wallet errado.** O OCI não consegue encontrar `cwallet.sso` no diretório especificado. O erro tipicamente aparece como `ORA-28759: failure to open file`. Verifique se o caminho aponta para o diretório contendo os arquivos do wallet, não para um arquivo individual ou um diretório pai.

**Incompatibilidade de SSL_SERVER_DN_MATCH.** O nome distinto do certificado no descritor de conexão não corresponde ao certificado do servidor. Isso aparece como `ORA-29024: Certificate validation failure` e é mais comumente causado pelo uso de um `tnsnames.ora` de um tenant ou região diferente do wallet.

**Wallet expirado.** Os wallets OCI têm uma data de validade. Um wallet expirado produz `ORA-28866: SSL connection failed` ou um erro similar de negociação SSL. Baixe um wallet novo no console OCI e atualize o caminho em seu perfil de conexão.

O Veesker expõe a cadeia de erros do OCI literalmente no painel de erros de conexão em vez de envolvê-la em uma mensagem genérica de "falha na conexão". O código de erro bruto é quase sempre mais útil do que o resumo superficial — e é o que o suporte Oracle pedirá de qualquer forma.

---

Se você está conectando ao Oracle Cloud Autonomous Database ou a um ambiente mTLS local, baixe o Veesker e deixe o perfil de conexão gerenciar a configuração do wallet: [veesker.cloud/download](/download).

— *Veesker*
