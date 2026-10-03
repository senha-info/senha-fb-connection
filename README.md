# @senhainfo/fb-connection (v2.0)

Biblioteca para conexão de alta performance com banco de dados Firebird, desenvolvida para o ecossistema de microsserviços e APIs da Senha Informática.

A versão **2.0.0** é uma reescrita moderna focada em escalabilidade, eliminando o overhead de abertura e fechamento de conexões TCP por requisição através do **Connection Pool Nativo** do Firebird.

---

## 🚀 O que há de novo na v2.0

* **Connection Pool Nativo (`Firebird.pool`):** As conexões físicas ficam abertas e aquecidas em memória (`idle`), sendo reutilizadas instantaneamente. Acabou o gargalo de handshake de rede e CPU no servidor Firebird.
* **Fila de Espera Automática (`pending`):** Requisições que excederem o limite de concorrência (`concurrency`) aguardam automaticamente em uma fila FIFO interna sem gerar erro ou derrubar o banco.
* **Transações Modernas:** Novo método `connection.transaction()` com **auto-commit** ao concluir e **auto-rollback** automático em caso de erro, com suporte nativo a `savepoint`.
* **Health Check & Graceful Shutdown:** Métodos `ping()` e `destroy()` integrados para observabilidade e desligamento seguro de pods/containers.
* **Métricas do Pool em Tempo Real:** Obtenha `totalCount`, `idleCount`, `activeCount` e `waitingCount` a qualquer momento.
* **Paginação Nativa:** `GetDataFromTable` com suporte nativo a `limit` e `offset`.
* **Compatibilidade Retroativa:** Todo o código da v1.x foi preservado e está disponível via subpath import `@senhainfo/fb-connection/v1`.

---

## 📦 Instalação

```bash
npm install @senhainfo/fb-connection
# ou
yarn add @senhainfo/fb-connection
```

---

## 🛠️ Guia de Uso (v2.0)

### 1. Inicializando a Conexão

```typescript
import { FirebirdConnection } from '@senhainfo/fb-connection';

const connection = new FirebirdConnection({
  host: process.env.FB_HOST,
  port: Number(process.env.FB_PORT) || 3050,
  user: process.env.FB_USER,
  password: process.env.FB_PASSWORD,
  database: process.env.FB_DATABASE,
  concurrency: 20,           // Teto máximo de conexões simultâneas no pool (default: 20)
  min: 2,                    // Quantidade mínima de conexões mantidas abertas (default: 0)
  idleTimeoutMillis: 30000,  // Tempo para fechar conexão ociosa (default: 30s)
  connectTimeout: 10000,     // Timeout para estabelecer nova conexão (default: 10s)
  encoding: 'WIN1252',       // Codificação dos caracteres (default: 'WIN1252')
  lowercaseKeys: true,       // Chaves do objeto retornadas em minúsculo (default: true)
  blobAsText: true,          // Campos BLOB lidos como texto automaticamente (default: true)
  timeZone: 'Europe/Lisbon', // Opcional: fuso ('America/Sao_Paulo', 'Europe/Lisbon', etc.). Padrão: fuso local da máquina
});
```

### 2. Executando Consultas

```typescript
interface Cliente {
  id: number;
  razao_social: string;
}

// A conexão é obtida do pool e devolvida automaticamente após a consulta
const clientes = await connection.execute<Cliente>(
  'SELECT id, razao_social FROM cad_clientes WHERE ativo = ?',
  ['S']
);
```

### 3. Transações com Auto-Commit e Auto-Rollback

```typescript
await connection.transaction(async (tx) => {
  await tx.execute('UPDATE contas SET saldo = saldo - ? WHERE id = ?', [100, 1]);
  await tx.execute('UPDATE contas SET saldo = saldo + ? WHERE id = ?', [100, 2]);

  // Savepoints aninhados:
  await tx.savepoint(async (nestedTx) => {
    await nestedTx.execute('INSERT INTO log_transacoes (descricao) VALUES (?)', ['Transferência efetuada']);
  });

  // Se qualquer erro for disparado dentro do bloco,
  // o ROLLBACK é executado automaticamente.
});
```

### 4. Health Check e Encerramento Gracioso

```typescript
// Health check rápido (usado em endpoints como /health)
const isHealthy = await connection.ping();

// Graceful shutdown (usado no fechamento da API / sinais SIGTERM e SIGINT)
await connection.destroy();
```

### 5. Métricas do Pool (Observabilidade)

```typescript
console.log(connection.metrics);
// {
//   totalCount: 5,   // Conexões físicas totais gerenciadas pelo pool
//   idleCount: 3,    // Conexões livres no pool aguardando queries
//   activeCount: 2,  // Conexões atualmente em uso
//   waitingCount: 0  // Requisições aguardando liberação de vaga na fila
// }
```

---

## 🧰 Utilitários Disponíveis na v2

* **`buildWhere`**: Construtor dinâmico de cláusula `WHERE` a partir de condições.
* **`GetDataFromTable`**: Consulta registros de tabelas com suporte a `columns`, `joins`, `conditions`, `orderBy`, `limit` e `offset`.
* **`GetNextSequence`**: Obtém o próximo valor de um generator Firebird (`gen_id`).
* **`GenerateQuery`**: Geração dinâmica de queries `update or insert` (upsert) e `update` com cache de metadados.
* **`GenerateSchema`**: Utilitário para ler o banco e gerar interfaces TypeScript das tabelas.
* **`GenerateSearchTerms`**: Montador de cláusulas multi-atributos para buscas textuais parciais.

---

## 🔄 Usando a versão legada (v1.x)

Caso algum projeto antigo ainda dependa estritamente da implementação e do comportamento da v1.x (com `p-limit`), basta importar a partir do subpath `/v1`:

```typescript
import { FirebirdConnection } from '@senhainfo/fb-connection/v1';

const connection = new FirebirdConnection({
  host: 'localhost',
  port: 3050,
  user: 'SYSDBA',
  password: 'masterkey',
  database: 'C:/dados/banco.fdb',
  concurrency: 20,
});

const result = await connection.execute('SELECT * FROM cad_clientes');
```

---

## 📄 Licença

MIT © [Senha Informática](https://github.com/senha-info)
