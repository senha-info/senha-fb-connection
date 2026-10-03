import * as Firebird from 'node-firebird';
import type { FirebirdConnectionOptions, PoolMetrics, QueryParam, TransactionContext } from './types.js';

/**
 * Firebird database connection manager backed by a native connection pool.
 * Provides connection pooling, automatic resource cleanup, transaction management with savepoints,
 * and health checking.
 */
export class FirebirdConnection {
  private pool: Firebird.ConnectionPool;

  /**
   * Escapes values safely for raw SQL queries using node-firebird escape utility.
   */
  public escape = Firebird.escape;

  /**
   * Parsed node-firebird connection options used by the pool.
   */
  public readonly options: Firebird.Options;

  /**
   * Optional timezone configured for date and timestamp serialization.
   */
  public readonly timeZone?: string;

  /**
   * Creates a new FirebirdConnection instance with a native connection pool.
   *
   * @param options Connection and pool configuration options.
   */
  constructor(options: FirebirdConnectionOptions) {
    const {
      concurrency = 20,
      timeZone,
      lowercaseKeys = true,
      encoding = 'WIN1252',
      blobAsText = true,
      pageSize = 4096,
      min = 0,
      idleTimeoutMillis = 30000,
      connectTimeout = 10000,
      ...restOptions
    } = options;

    this.timeZone = timeZone;

    this.options = {
      ...restOptions,
      encoding,
      blobAsText,
      lowercase_keys: lowercaseKeys,
      pageSize,
      min,
      idleTimeoutMillis,
      connectTimeout,
    };

    // Initialize native connection pool with FIFO pending queue
    this.pool = Firebird.pool(concurrency, this.options);

    this.initialize().catch((err) => {
      console.warn('✕ Failed to initialize VARCHAR5000 domain:', err.message);
    });
  }

  /**
   * Executes a SQL query using a connection leased from the pool.
   * The physical connection is acquired, the query is executed, and the connection
   * is automatically returned to the pool upon completion (via finally block).
   *
   * @template T Expected row record type.
   * @param query SQL query statement.
   * @param params Optional parameterized query values.
   * @returns Array of query result rows.
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
   * Executes a set of operations within a transaction with auto-commit and auto-rollback.
   * If the `work` callback completes successfully, the transaction is committed.
   * If any exception is thrown, the transaction is automatically rolled back.
   *
   * @template T Result type returned by the callback.
   * @param work Callback receiving the transaction context.
   * @param isolation Optional transaction isolation level or transaction options.
   * @returns The result returned by the callback.
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
   * Leases an individual database connection from the pool and executes the provided callback,
   * ensuring the connection is safely released back to the pool afterwards.
   * Useful for streams, batch operations, or custom sequential workflows.
   *
   * @template T Result type.
   * @param work Callback receiving the native database handle.
   * @returns The result returned by the callback.
   */
  async withConnection<T>(work: (db: Firebird.Database) => Promise<T> | T): Promise<T> {
    return this.pool.withConnection(work);
  }

  /**
   * Checks database connectivity and health by executing a simple query against `RDB$DATABASE`.
   *
   * @returns `true` if connected successfully, `false` otherwise.
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
   * Gracefully terminates and closes all open connections in the pool.
   */
  async destroy(): Promise<void> {
    await this.pool.destroyAsync();
  }

  /**
   * Convenience alias for {@link destroy}.
   */
  async close(): Promise<void> {
    return this.destroy();
  }

  /**
   * Returns the underlying native node-firebird ConnectionPool instance.
   */
  getPool(): Firebird.ConnectionPool {
    return this.pool;
  }

  /** Total number of physical connections managed by the pool (in use + idle). */
  get totalCount(): number {
    return this.pool.totalCount;
  }

  /** Number of connections currently idle and warm in the pool. */
  get idleCount(): number {
    return this.pool.idleCount;
  }

  /** Number of connections currently in active use by queries or transactions. */
  get activeCount(): number {
    return this.pool.activeCount;
  }

  /** Number of requests currently queued in the FIFO pool queue waiting for a free connection. */
  get waitingCount(): number {
    return this.pool.waitingCount;
  }

  /** Consolidated metrics snapshot of the connection pool. */
  get metrics(): PoolMetrics {
    return {
      totalCount: this.totalCount,
      idleCount: this.idleCount,
      activeCount: this.activeCount,
      waitingCount: this.waitingCount,
    };
  }

  /**
   * Ensures the `VARCHAR5000` domain exists in the Firebird catalog, creating it if absent.
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
      // Ignore error if domain was created concurrently or user lacks DDL privileges
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
