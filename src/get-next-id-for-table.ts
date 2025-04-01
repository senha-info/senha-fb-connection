import { executePromise } from "@senhainfo/shared-utils";
import { FirebirdConnection } from "./connection";

interface GetNextIdForTableRequest {
  table: string;
  isPrimaryKey?: boolean;
}

interface GetNextIdForTableResponse {
  nextId: number;
}

export class GetNextIdForTable {
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Get the next id for the table
   *
   * @param {string} table The table to get the next id for
   * @returns {number} The next id for the table
   */
  async execute({ table, isPrimaryKey = true }: GetNextIdForTableRequest): Promise<GetNextIdForTableResponse> {
    const name = isPrimaryKey ? `gen_${table}_id` : `gen_${table}`;

    const [ids, error] = await executePromise(
      this.firebird.execute<{ gen_id: number }>(`select gen_id(${name}, 1) from rdb$database`)
    );

    if (error) {
      throw new Error(error);
    }

    const [{ gen_id }] = ids;

    return {
      nextId: gen_id,
    };
  }
}
