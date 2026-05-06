import { executePromise } from '@senhainfo/shared-utils';
import Firebird from 'node-firebird';

interface FirebirdOptions extends Omit<Firebird.Options, 'lowercase_keys'> {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;

  /**
   * @default true
   */
  blobAsText?: boolean;

  /**
   * @default true
   */
  lowercaseKeys?: boolean;

  /**
   * @default 4096
   */
  pageSize?: number;

  /**
   * @default 20
   */
  concurrency?: number;
}

export class FirebirdConnection {
  private options: Firebird.Options = {
    blobAsText: true,
    lowercase_keys: true,
    pageSize: 4096,
  };

  private concurrencyLimit = 20;

  /**
   * @param {FirebirdOptions} options The options to be used in the connection
   */
  constructor(options: FirebirdOptions) {
    if (options.concurrency) {
      this.concurrencyLimit = options.concurrency;
    }

    delete options.concurrency;

    const parsedOptions: Firebird.Options = {
      ...options,
      lowercase_keys: options.lowercaseKeys ?? this.options.lowercase_keys,
    };

    Object.assign(this.options, parsedOptions);

    this.initialize();
  }

  /**
   * Execute a query and return the result
   * @param {string} query The query to be executed
   * @param {(string | number)[]} params The parameters to be used in the query
   * @returns {Promise<T[]>} The result of the query
   * @example
   * const connection = new FirebirdConnection(options);
   * const result = await connection.execute('SELECT * FROM TABLE', []);
   * console.log(result); // Prints the result of the query
   */
  public async execute<T>(query: string, params: (string | number)[] = []): Promise<T[]> {
    const pLimit = await getPLimit();

    const limit = pLimit(this.concurrencyLimit);

    return limit(() => {
      return new Promise((resolve, reject) => {
        Firebird.attach(this.options, (error, database) => {
          if (error) {
            if (database) database.detach();
            return reject(error);
          }

          database.query(query, params, (error, result) => {
            if (database) database.detach();

            if (error) {
              return reject(error);
            }

            if (!Array.isArray(result)) {
              result = [result];
            }

            return resolve(result);
          });
        });
      });
    });
  }

  private async initialize(): Promise<void> {
    const domain = 'VARCHAR5000';

    const select = `
      SELECT RDB$FIELD_NAME AS FNAME
      FROM RDB$FIELDS WHERE RDB$FIELD_NAME = ?
    `;

    const [fields, error] = await executePromise(this.execute<{ fname: string }>(select, [domain]));

    if (error) {
      throw new Error(error);
    }

    const [field] = fields;

    if (!field) {
      const insert = `
        CREATE DOMAIN ${domain} AS
        VARCHAR(5000) CHARACTER SET WIN1252
        COLLATE WIN_PTBR;
      `;

      await this.execute(insert);
    }
  }

  public escape = Firebird.escape;
}
