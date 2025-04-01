import { executePromise } from "@senhainfo/shared-utils";
import Firebird from "node-firebird";

interface FirebirdOptions extends Omit<Firebird.Options, "lowercase_keys"> {
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
}

export class FirebirdConnection {
  private static instance: FirebirdConnection;
  private options: Firebird.Options = {
    blobAsText: true,
    lowercase_keys: true,
    pageSize: 4096,
  };

  /**
   * Firebird constructor is private, instantiate it using static getInstance or newInstance
   * @param {FirebirdOptions} options The options to be used in the connection
   */
  private constructor(options: FirebirdOptions) {
    const parsedOptions: Firebird.Options = {
      ...options,
      lowercase_keys: options.lowercaseKeys ?? this.options.lowercase_keys,
    };

    Object.assign(this.options, parsedOptions);

    this.initialize();
  }

  public static getInstance(options: FirebirdOptions): FirebirdConnection {
    if (!this.instance) {
      this.instance = new FirebirdConnection(options);
    }

    return this.instance;
  }

  public static newInstance(options: FirebirdOptions): FirebirdConnection {
    return new FirebirdConnection(options);
  }

  private async getConnection(): Promise<Firebird.Database> {
    return new Promise((resolve, reject) => {
      Firebird.attach(this.options, (error, database) => {
        if (error) {
          if (database) database.detach();
          return reject(error);
        }

        database.on("commit", () => {
          database.detach();
        });

        database.on("rollback", () => {
          database.detach();
        });

        return resolve(database);
      });
    });
  }

  /**
   * Execute a query and return the result
   *
   * @param {string} query The query to be executed
   * @param {(string | number)[]} params The parameters to be used in the query
   * @returns {Promise<T[]>} The result of the query
   */
  async execute<T>(query: string, params: (string | number)[] = []): Promise<T[]> {
    const connection = await this.getConnection();

    return new Promise((resolve, reject) => {
      connection.transaction(Firebird.ISOLATION_READ_COMMITTED, (error, transaction) => {
        if (error) {
          if (transaction) transaction.rollback();
          return reject(error);
        }

        transaction.query(query, params, (error, result) => {
          if (error) {
            transaction.rollback();
            return reject(error);
          }

          if (!Array.isArray(result)) {
            result = [result];
          }

          transaction.commit((error) => {
            if (error) {
              transaction.rollback();
              return reject(error);
            }

            return resolve(result);
          });
        });
      });
    });
  }

  private async initialize(): Promise<void> {
    const domainName = "VARCHAR5000";

    const select = `
      select rdb$field_name as fname
      from rdb$fields where rdb$field_name = ?
    `;

    const [fields, error] = await executePromise(this.execute<{ fname: string }>(select, [domainName]));

    if (error) {
      throw new Error(error);
    }

    const [field] = fields;

    if (!field) {
      const insert = `
        CREATE DOMAIN ${domainName} AS
        VARCHAR(5000) CHARACTER SET WIN1252
        COLLATE WIN_PTBR;
      `;

      await this.execute(insert);
    }
  }
}

export const escape = Firebird.escape;
