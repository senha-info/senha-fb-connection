import type * as Firebird from 'node-firebird';

/**
 * Opções de configuração para o FirebirdConnection
 */
export interface FirebirdConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  role?: string;
  encoding?: Firebird.SupportedCharacterSet;
  blobAsText?: boolean;
  lowercaseKeys?: boolean;
  pageSize?: number;
  concurrency?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectTimeout?: number;
  statementCacheSize?: number;
  timeZone?: string;
}

/**
 * Tipos de parâmetros permitidos em queries SQL
 */
export type QueryParam = string | number | boolean | Date | null | undefined;

/**
 * Contexto de execução de uma transação ativa
 */
export interface TransactionContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute<T = any>(query: string, params?: QueryParam[]): Promise<T[]>;
  savepoint<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
  readonly rawTransaction: Firebird.Transaction;
}

/**
 * Snapshot das métricas do pool em tempo real
 */
export interface PoolMetrics {
  totalCount: number;
  idleCount: number;
  activeCount: number;
  waitingCount: number;
}

/**
 * Parâmetro individual para construção da cláusula WHERE
 */
export interface WhereParams {
  value: unknown;
  condition: boolean;
  query: (value: string) => string;
}

/**
 * Utilitário TypeScript que torna todas as propriedades opcionais e aceita null
 */
export type PartialNullable<T> = {
  [P in keyof T]?: T[P] | null;
};

/**
 * Parâmetros para geração dinâmica de query (upsert / update)
 */
export interface GenerateQueryRequest<T, K extends string = string> {
  type?: 'upsert' | 'update';
  table: K;
  data: PartialNullable<T>;
  primaryKey: keyof T;
  /**
   * Campos que devem manter sua caixa original (sem conversão automática para UPPERCASE).
   */
  preserveCase?: (keyof T)[];
  matching?: (keyof T)[];
  returning?: (keyof T)[] | ['*'];
}

/**
 * Retorno das partes geradas pela query
 */
export interface GenerateQueryResponse {
  query: string;
  columns: string;
  values: string;
}

/**
 * Parâmetros de consulta para GetDataFromTable
 */
export interface GetDataFromTableRequest {
  table: string;
  columns: string[];
  conditions?: string[];
  joins?: string[];
  orderBy?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Estrutura genérica de resposta caso tipo não seja especificado
 */
export type GenericResponse = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

/**
 * Tipo inferido para o resultado de GetDataFromTable
 */
export type GetDataFromTableResponse<T = GenericResponse> = [T] extends [undefined] ? GenericResponse : T;

/**
 * Parâmetros para buscar o próximo valor de um gerador
 */
export interface GetNextSequenceRequest {
  /**
   * Nome do generator Firebird
   */
  generator: string;

  /**
   * Se true, busca `gen_{generator}_id`. Se false, busca `gen_{generator}`
   * @default true
   */
  isTableId?: boolean;
}

/**
 * Resposta contendo o próximo número de sequência
 */
export interface GetNextSequenceResponse {
  nextSequence: number;
}

/**
 * Parâmetros de pesquisa para GenerateSearchTerms
 */
export interface GetSearchTermsRequest<T> {
  search?: string;
  primaryKey?: keyof T;
  attributes: (keyof T)[];
  /**
   * Tamanho mínimo de cada palavra para ser incluída no filtro.
   * Evita que conectivos e palavras curtas ("de", "da", "e") sobrecarreguem a consulta.
   * @default 3
   */
  minWordLength?: number;
}

/**
 * Opções de configuração para o GenerateSchema
 */
export interface GenerateSchemaOptions {
  /**
   * Diretório de destino para salvar o arquivo de schema gerado
   * @default "./src/schemas"
   */
  destinationFolder?: string;
  /**
   * Nome do arquivo gerado
   * @default "fb-schema.ts"
   */
  fileName?: string;
}
