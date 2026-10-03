import type * as Firebird from 'node-firebird';

/**
 * Configuration options for FirebirdConnection and the underlying native connection pool.
 * Inherits all native options from `Firebird.Options` except `lowercase_keys` (aliased as `lowercaseKeys`).
 */
export interface FirebirdConnectionOptions extends Omit<Firebird.Options, 'lowercase_keys'> {
  /**
   * Database server hostname or IP address.
   */
  host: string;

  /**
   * Database server port number.
   * @default 3050
   */
  port: number;

  /**
   * Database username (e.g. `'SYSDBA'`).
   */
  user: string;

  /**
   * Database user password.
   */
  password: string;

  /**
   * Database path or alias on the server.
   */
  database: string;

  /**
   * Character set used for database connections.
   * @default 'WIN1252'
   */
  encoding?: Firebird.SupportedCharacterSet;

  /**
   * Whether to read text BLOB columns (sub_type 1) directly as strings instead of Buffers / Streams.
   * @default true
   */
  blobAsText?: boolean;

  /**
   * Whether to automatically convert all returned row column keys to lowercase.
   * @default true
   */
  lowercaseKeys?: boolean;

  /**
   * Database page size in bytes (used when creating a database).
   * @default 4096
   */
  pageSize?: number;

  /**
   * Maximum number of concurrent database connections in the connection pool.
   * Queries beyond this limit automatically wait in a FIFO queue.
   * @default 20
   */
  concurrency?: number;

  /**
   * Minimum number of idle connections maintained open in the pool.
   * @default 0
   */
  min?: number;

  /**
   * Time in milliseconds before an idle connection is closed and evicted from the pool.
   * @default 30000
   */
  idleTimeoutMillis?: number;

  /**
   * Connection timeout in milliseconds when establishing a connection to the database.
   * @default 10000
   */
  connectTimeout?: number;

  /**
   * Maximum number of prepared statements cached per physical connection.
   */
  statementCacheSize?: number;

  /**
   * Timezone identifier used for date and timestamp serialization (e.g. `'America/Sao_Paulo'`, `'Europe/Lisbon'`).
   * When omitted, the local machine timezone is used.
   */
  timeZone?: string;
}

/**
 * Allowed parameter types for parameterized SQL queries.
 */
export type QueryParam = string | number | boolean | Date | null | undefined;

/**
 * Execution context for an active database transaction.
 */
export interface TransactionContext {
  /**
   * Executes a parameterized query within the active transaction.
   *
   * @template T Expected row record type.
   * @param query SQL query statement.
   * @param params Optional array of query parameters.
   * @returns Array of query result rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute<T = any>(query: string, params?: QueryParam[]): Promise<T[]>;

  /**
   * Executes an isolated unit of work inside a nested savepoint within the transaction.
   * If an error occurs, rolls back to this savepoint without aborting the parent transaction.
   *
   * @template T Result type of the savepoint callback.
   * @param work Function to execute inside the savepoint.
   * @returns The result of the callback work.
   */
  savepoint<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;

  /**
   * The underlying native node-firebird transaction instance.
   */
  readonly rawTransaction: Firebird.Transaction;
}

/**
 * Real-time metrics snapshot of the connection pool.
 */
export interface PoolMetrics {
  /** Total number of physical connections managed by the pool (in use + idle). */
  totalCount: number;
  /** Number of connections currently idle and warm in the pool. */
  idleCount: number;
  /** Number of connections currently in active use by queries or transactions. */
  activeCount: number;
  /** Number of requests currently queued in the FIFO pool queue waiting for a free connection. */
  waitingCount: number;
}

/**
 * Parameter configuration for dynamic WHERE clause building.
 */
export interface WhereParams {
  /** The value to be evaluated and serialized into the query condition. */
  value: unknown;
  /** Boolean condition that determines whether this filter clause should be included. */
  condition: boolean;
  /** Builder function that receives the serialized value and returns the SQL condition snippet. */
  query: (value: string) => string;
}

/**
 * TypeScript utility type that makes all properties of T optional and nullable.
 */
export type PartialNullable<T> = {
  [P in keyof T]?: T[P] | null;
};

/**
 * Parameters for dynamic SQL query generation (upsert / update).
 */
export interface GenerateQueryRequest<T, K extends string = string> {
  /**
   * Operation type: `'upsert'` (UPDATE OR INSERT) or `'update'` (UPDATE).
   * @default 'upsert'
   */
  type?: 'upsert' | 'update';

  /**
   * Target database table name.
   */
  table: K;

  /**
   * Object containing column-value pairs to insert or update.
   */
  data: PartialNullable<T>;

  /**
   * Primary key column name.
   */
  primaryKey: keyof T;

  /**
   * Column names that should preserve their original casing (skip automatic UPPERCASE conversion).
   */
  preserveCase?: (keyof T)[];

  /**
   * Column names used in the Firebird `MATCHING (...)` clause for upsert operations.
   * Defaults to `primaryKey`.
   */
  matching?: (keyof T)[];

  /**
   * Column names to return in the Firebird `RETURNING ...` clause.
   * Defaults to `[primaryKey]`.
   */
  returning?: (keyof T)[] | ['*'];
}

/**
 * Generated SQL query parts and full statement.
 */
export interface GenerateQueryResponse {
  /** Full generated SQL statement. */
  query: string;
  /** Formatted column list snippet. */
  columns: string;
  /** Formatted values or assignments snippet. */
  values: string;
}

/**
 * Query parameters for GetDataFromTable.
 */
export interface GetDataFromTableRequest {
  /** Target table name to query from. */
  table: string;
  /** List of column names to select. If empty or omitted, selects `*`. */
  columns: string[];
  /** Optional array of WHERE conditions joined by `AND`. */
  conditions?: string[];
  /** Optional array of JOIN clauses. */
  joins?: string[];
  /** Optional array of ORDER BY column expressions. */
  orderBy?: string[];
  /** Maximum number of rows to return (pagination). */
  limit?: number;
  /** Number of rows to skip before returning results (pagination). */
  offset?: number;
}

/**
 * Generic key-value record type for query results when no schema is specified.
 */
export type GenericResponse = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

/**
 * Inferred response type for GetDataFromTable query results.
 */
export type GetDataFromTableResponse<T = GenericResponse> = [T] extends [undefined] ? GenericResponse : T;

/**
 * Parameters for retrieving the next value of a Firebird generator/sequence.
 */
export interface GetNextSequenceRequest {
  /**
   * Name of the Firebird generator.
   */
  generator: string;

  /**
   * If `true`, queries `gen_${generator}_id`. If `false`, queries `gen_${generator}`.
   * @default true
   */
  isTableId?: boolean;
}

/**
 * Response containing the generated sequence value.
 */
export interface GetNextSequenceResponse {
  /** Next sequence number generated by Firebird. */
  nextSequence: number;
}

/**
 * Search parameters for GenerateSearchTerms multi-field text search.
 */
export interface GetSearchTermsRequest<T> {
  /** Search query string containing one or more words. */
  search?: string;
  /** Optional primary key attribute for exact match comparison. */
  primaryKey?: keyof T;
  /** Attributes/columns to search across. */
  attributes: (keyof T)[];
  /**
   * Minimum length of each word to be included in the search condition.
   * Prevents short connector words from bloating the query.
   * @default 3
   */
  minWordLength?: number;
}

/**
 * Configuration options for GenerateSchema.
 */
export interface GenerateSchemaOptions {
  /**
   * Destination folder where the generated schema file will be written.
   * @default "./src/schemas"
   */
  destinationFolder?: string;
  /**
   * Name of the generated schema file.
   * @default "fb-schema.ts"
   */
  fileName?: string;
}
