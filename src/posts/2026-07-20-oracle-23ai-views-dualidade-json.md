---
title: "Oracle 23ai JSON Relational Duality Views: o que são e como consultá-las"
description: "As JSON Relational Duality Views permitem ler e escrever dados relacionais como documentos JSON sem manter um armazenamento de documentos separado."
date: "2026-07-20"
slug: "oracle-23ai-views-dualidade-json"
lang: "pt"
kind: "deep-dive"
tags: ["oracle", "23ai", "json", "duality-views", "sql"]
translation_slug: "oracle-23ai-json-duality-views"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

O debate entre o modelo relacional e o modelo de documentos tem uma trilha de vinte anos. Bancos de dados de documentos escalam escritas com menos cerimônia. Bancos de dados relacionais impõem integridade referencial. Aplicações moldadas como objetos querem APIs de documentos; conformidade e relatórios precisam de JOINs. A maioria das equipes resolve a tensão executando dois sistemas, sincronizando-os e gastando a maior parte do esforço operacional mantendo-os consistentes.

O Oracle 23ai adota uma posição diferente: armazenamento relacional, superfície JSON. As JSON Relational Duality Views permitem ler e escrever dados por meio de uma interface de documento JSON enquanto a representação subjacente permanece em tabelas relacionais totalmente normalizadas. Uma única fonte de verdade, dois padrões de acesso.

Isso não é um wrapper que pega uma coluna JSON e impõe alguma estrutura. É um objeto DDL de primeira classe com seu próprio bloqueio otimista, seu próprio ciclo de vida REST via ORDS e suas próprias regras sobre quais partes do documento você possui e quais apenas referencia. Este post explica o que é uma duality view, como defini-la e como consultá-la e mutá-la.

## O modelo: owned vs. linked

Uma JSON Relational Duality View é construída a partir de uma ou mais tabelas unidas de forma controlada. O conceito central é **propriedade** (ownership). Uma tabela na view pode ser:

- **Owned** (proprietária): a view gerencia seu ciclo de vida. Um `INSERT` na view pode criar linhas em uma tabela proprietária; um `DELETE` pode removê-las.
- **Linked** (via `@UNNEST` ou `@LINK`): a view lê da tabela mas não gerencia suas linhas. Você pode atualizar referências de chave estrangeira, mas não pode criar ou excluir as linhas referenciadas por essa view.

Essa distinção é o que impede a duality view de se tornar uma armadilha. Você declara a propriedade explicitamente no DDL, e o Oracle a impõe. Um `DELETE` na view só propaga para as tabelas que você declarou como proprietárias.

## Configurando um exemplo

```sql
CREATE TABLE departments (
    department_id  NUMBER         PRIMARY KEY,
    name           VARCHAR2(100)  NOT NULL
);

CREATE TABLE employees (
    employee_id    NUMBER         PRIMARY KEY,
    name           VARCHAR2(100)  NOT NULL,
    email          VARCHAR2(200),
    department_id  NUMBER
        REFERENCES departments(department_id)
);
```

Nada incomum — um esquema clássico de duas tabelas. Agora a duality view por cima:

```sql
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW employee_dv AS
    employees @INSERT @UPDATE @DELETE
    {
        employeeId   : employee_id,
        name,
        email,
        department   : departments @UNNEST
        {
            departmentId   : department_id,
            departmentName : name
        }
    };
```

As anotações `@INSERT @UPDATE @DELETE` em `employees` a declaram como proprietária. O `@UNNEST` em `departments` incorpora os dados do departamento diretamente, mas não concede à view controle do ciclo de vida sobre as linhas do departamento. Você pode mover um funcionário do departamento 10 para o 20 por essa view. Não pode excluir o departamento 20 excluindo o funcionário.

## Lendo documentos

```sql
SELECT json_serialize(data PRETTY)
FROM   employee_dv
WHERE  data.employeeId = 101;
```

O Oracle retorna um documento JSON formatado:

```json
{
  "employeeId"    : 101,
  "name"          : "Marcus Vinícius",
  "email"         : "marcus@example.com",
  "department"    : {
    "departmentId"   : 10,
    "departmentName" : "Engineering"
  },
  "_metadata" : {
    "etag"  : "8A3F9C2D",
    "asof"  : "0000000001234ABC"
  }
}
```

O objeto `_metadata` não é ruído opcional. O `etag` é usado para bloqueio otimista: ao atualizar um documento, você passa o etag de volta, e o Oracle rejeita a escrita se as linhas subjacentes mudaram desde a sua leitura. É o mesmo padrão de detecção de conflitos que bancos de documentos usam, expresso em SQL.

Você também pode usar sintaxe de path JSON na cláusula `WHERE` sem `json_serialize` se precisar apenas de campos específicos:

```sql
SELECT data.name, data.department.departmentName
FROM   employee_dv
WHERE  data.employeeId = 101;
```

O Oracle faz o JOIN com `departments` e projeta o campo aninhado. Você não precisa escrever o JOIN.

## Inserindo pela view

```sql
INSERT INTO employee_dv
VALUES ('{"employeeId": 201, "name": "Ana Beatriz",
          "email": "ana@example.com",
          "department": {"departmentId": 10}}');
```

O Oracle analisa o JSON, grava em `employees` e resolve a referência `department.departmentId` para a linha existente em `departments`. Se você tentar um `departmentId` inexistente, a restrição referencial na tabela `employees` subjacente é acionada. A integridade relacional não desaparece porque você usou uma API de documentos.

## Atualizando pela view

O padrão canônico para uma atualização de duality view é a substituição do documento completo: leia o documento (incluindo seu `_metadata.etag`), modifique os campos desejados e, então, substitua:

```sql
UPDATE employee_dv dv
SET    dv.data = JSON_MERGEPATCH(
           dv.data,
           '{"email": "ana.new@example.com"}'
       )
WHERE  dv.data.employeeId = 201
AND    JSON_VALUE(dv.data, '$._metadata.etag') = '8A3F9C2D';
```

A verificação do `etag` na cláusula `WHERE` é o bloqueio otimista. Se outra sessão modificou esse funcionário desde sua última leitura, o etag não vai corresponder, a atualização afeta zero linhas e sua aplicação sabe que precisa recarregar e tentar novamente. Sem locks explícitos de tabela, sem penalidade de serialização no caminho feliz.

## A camada ORDS

O Oracle REST Data Services pode expor uma duality view como uma coleção REST automaticamente. Uma chamada `ORDS.ENABLE_OBJECT` na view produz endpoints padrão GET / POST / PUT / DELETE em uma URL que sua aplicação pode chamar sem escrever SQL. O formato da carga REST espelha a estrutura JSON que você declarou no DDL.

É isso que torna as duality views relevantes para equipes de API: você define o formato do documento uma vez, em SQL, e o acesso por REST, SQL e path JSON respeita o mesmo formato. Sem biblioteca de mapeamento objeto-relacional no meio, sem event bus mantendo um armazenamento de documentos sincronizado, sem job de reconciliação. O banco de dados é o armazenamento de documentos, e sua normalização é invisível para o consumidor.

## O que o 23ai adiciona ao redor delas

As duality views são um recurso do 23c que se mantém no 23ai. Especificamente no 23ai:

- Os recursos com suporte a vetores (`VECTOR_DISTANCE`, colunas de embedding) em tabelas adjacentes são consultáveis na mesma sessão. Um esquema híbrido que combina duality views para dados de entidade no estilo de documentos com colunas de vetor para busca por embedding é expressável em uma única instância do Oracle 23ai.
- A cláusula `JSON SCHEMA VALIDATE ON` em colunas que alimentam uma duality view permite bloquear escritas no nível da coluna antes que a API de documento as veja.
- As views de desempenho em `V$SQL` identificam operações de duality view, então a saída do `EXPLAIN PLAN` ainda fornece o plano de execução relacional subjacente. Você pode ajustar o layout de índices sem alterar a interface de documento.

## Como o Veesker exibe isso

O Veesker lê a versão do servidor conectado durante o handshake. Em uma conexão 11g, a árvore de objetos não tem categoria de duality view — porque o servidor não tem esse conceito. No 23ai, o navegador de esquema inclui um nó `JSON Duality Views` em cada esquema, ao lado de tabelas, views e procedures.

A camada de IA é controlada pela versão da mesma forma: em uma conexão 23ai, sugestões de consulta podem referenciar sintaxe de duality view; no 19c, não o fazem. Não há o problema de "aqui estão os recursos do 23ai mesmo que você esteja no 12c", porque o grounding vem do que o servidor declarou na conexão — não do que o Oracle está promovendo no momento.

A assistência de código para DDL de duality view — a sintaxe de anotação `@INSERT @UPDATE @DELETE` e o formato de referência de tabela aninhada — é um dos casos em que um LLM genérico treinado na web aberta produz saída incorreta. A sintaxe não existia antes do 23c, e a maioria dos corpora de treinamento reflete essa lacuna. A assistência com schema awareness do Veesker usa a gramática DDL para a versão que a conexão declarou.

O Veesker é local-first: ele lê seu esquema diretamente do banco de dados conectado, sem enviar a estrutura do esquema para nenhum servidor externo. A Edição Comunitária é Apache 2.0 e funciona totalmente offline. A camada Cloud — IA gerenciada, auto-tune com schema awareness e o VeeskerDB Sandbox — chega no segundo semestre de 2026; entre na lista de espera agora e garanta o preço founder de USD 29/assento/mês.

## O veredicto prático

As JSON Relational Duality Views merecem avaliação se você mantém um estate Oracle 23ai e tem código de aplicação que transita entre consultas relacionais e uma camada de documento JSON — especialmente se essa camada é uma view mantida manualmente, um banco de dados NoSQL auxiliar ou uma coluna `CLOB` com parsing JSON customizado.

Elas não substituem o suporte nativo a colunas JSON do Oracle, que continua sendo a ferramenta certa para armazenamento verdadeiramente sem esquema. Elas substituem o código de cola que mantém dados relacionais sincronizados com uma representação de documento. Se você já tem um esquema bem normalizado e precisa expô-lo como API de documentos, as duality views são o caminho de menor impacto.

Conecte sua instância 23ai no Veesker e abra o navegador de esquema para ver quais duality views já existem nos seus esquemas — pode haver mais do que você espera: [veesker.cloud/download](/download).

— *Veesker*
