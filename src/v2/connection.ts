import * as Firebird from 'node-firebird';
import type { FirebirdConnectionOptions, PoolMetrics, QueryParam, TransactionContext } from './types.js';

export class FirebirdConnection {
  private pool: Firebird.ConnectionPool;
  public escape = Firebird.escape;
  public readonly options: Firebird.Options;
  public readonly timeZone?: string;

  constructor(options: FirebirdConnectionOptions) {
    this.timeZone = options.timeZone;
    const concurrency = options.concurrency ?? 20;

    this.options = {
      host: options.host,
      port: options.port,
      user: options.user,
      password: options.password,
      database: options.database,
      role: options.role,
      encoding: options.encoding ?? 'WIN1252',
      blobAsText: options.blobAsText ?? true,
      lowercase_keys: options.lowercaseKeys ?? true,
      pageSize: options.pageSize ?? 4096,
      min: options.min ?? 0,
      idleTimeoutMillis: options.idleTimeoutMillis ?? 30000,
      connectTimeout: options.connectTimeout ?? 10000,
      statementCacheSize: options.statementCacheSize,
    };

    // Inicializa o Connection Pool nativo com fila de espera FIFO (pending)
    this.pool = Firebird.pool(concurrency, this.options);

    this.initialize().catch((err) => {
      console.warn('✕ Failed to initialize VARCHAR5000 domain:', err.message);
    });
  }

  /**
   * Executa uma consulta SQL utilizando uma conexão do pool.
   * A conexão física é adquirida, a query é executada e a conexão é devolvida
   * automaticamente ao pool no término (via bloco finally).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async execute<T = any>(query: string, params: QueryParam[] = []): Promise<T[]> {
    return this.pool.withConnection(async (db) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await db.queryAsync<T>(query, params as any);

      if (result === undefined || result === null) {
        return [];
      }

      return Array.isArray(result) ? result : [result];
    });
  }

  /**
   * Executa um conjunto de operações dentro de uma transação com auto-commit e auto-rollback.
   * Se o callback `work` for concluído com sucesso, o commit é executado.
   * Se qualquer exceção for lançada, o rollback é efetuado automaticamente.
   */
  async transaction<T>(
    work: (tx: TransactionContext) => Promise<T>,
    isolation?: Firebird.Isolation | Firebird.TransactionOptions,
  ): Promise<T> {
    return this.pool.withConnection(async (db) => {
      return db.withTransaction(async (rawTx) => {
        const txContext = this.createTxContext(rawTx);
        return await work(txContext);
      }, isolation);
    });
  }

  /**
   * Executa um callback com uma conexão individual do pool, garantindo
   * que ela seja liberada de volta ao pool após o uso.
   * Útil para streams, lote (batch) ou sequências customizadas.
   */
  async withConnection<T>(work: (db: Firebird.Database) => Promise<T> | T): Promise<T> {
    return this.pool.withConnection(work);
  }

  /**
   * Verifica a conectividade e saúde da conexão com o banco de dados.
   */
  async ping(): Promise<boolean> {
    try {
      await this.execute('SELECT 1 FROM RDB$DATABASE');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Encerra graciosamente todas as conexões abertas no pool.
   */
  async destroy(): Promise<void> {
    await this.pool.destroyAsync();
  }

  /**
   * Alias de conveniência para destroy().
   */
  async close(): Promise<void> {
    return this.destroy();
  }

  /**
   * Retorna a instância subjacente do ConnectionPool do node-firebird.
   */
  getPool(): Firebird.ConnectionPool {
    return this.pool;
  }

  /** Total de conexões físicas gerenciadas pelo pool (em uso + ociosas). */
  get totalCount(): number {
    return this.pool.totalCount;
  }

  /** Conexões atualmente ociosas e aquecidas no pool. */
  get idleCount(): number {
    return this.pool.idleCount;
  }

  /** Conexões atualmente em uso ativo por queries ou transações. */
  get activeCount(): number {
    return this.pool.activeCount;
  }

  /** Quantidade de requisições aguardando liberação de vaga na fila do pool. */
  get waitingCount(): number {
    return this.pool.waitingCount;
  }

  /** Snapshot consolidado das métricas de concorrência do pool. */
  get metrics(): PoolMetrics {
    return {
      totalCount: this.totalCount,
      idleCount: this.idleCount,
      activeCount: this.activeCount,
      waitingCount: this.waitingCount,
    };
  }

  /**
   * Garante a criação do domínio VARCHAR5000 no catálogo Firebird se ele não existir.
   */
  async initialize(): Promise<void> {
    try {
      const domain = 'VARCHAR5000';

      const select = `
        SELECT TRIM(RDB$FIELD_NAME) AS FNAME
        FROM RDB$FIELDS
        WHERE TRIM(RDB$FIELD_NAME) = ?
      `;

      const fields = await this.execute<{ fname: string }>(select, [domain]);

      if (!fields || fields.length === 0) {
        const insert = `
          CREATE DOMAIN ${domain} AS
          VARCHAR(5000) CHARACTER SET WIN1252
          COLLATE WIN_PTBR;
        `;

        await this.execute(insert);
      }
    } catch {
      // Ignora erro se o domínio já foi criado concorrentemente ou sem privilégios DDL
    }
  }

  private createTxContext(rawTx: Firebird.Transaction): TransactionContext {
    return {
      rawTransaction: rawTx,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async <T = any>(query: string, params: QueryParam[] = []): Promise<T[]> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await rawTx.queryAsync<T>(query, params as any);

        if (result === undefined || result === null) {
          return [];
        }

        return Array.isArray(result) ? result : [result];
      },
      savepoint: async <T>(nestedWork: (tx: TransactionContext) => Promise<T>): Promise<T> => {
        return rawTx.savepoint(async () => {
          return nestedWork(this.createTxContext(rawTx));
        });
      },
    };
  }
}
