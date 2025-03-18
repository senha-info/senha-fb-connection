import { executePromise } from "@senhainfo/shared-utils";
import { FirebirdConnection } from "./connection";

interface GetNextIdForTableRequest {
  table: string;
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
  async execute({ table }: GetNextIdForTableRequest): Promise<GetNextIdForTableResponse> {
    const [ids, error] = await executePromise(
      this.firebird.execute<{ gen_id: number }>(`select gen_id(gen_${table}_id, 1) from rdb$database`)
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
