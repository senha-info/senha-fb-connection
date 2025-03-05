import { executePromise } from "@senhainfo/shared-utils";
import { FirebirdConnection } from "./connection";

interface GetNextIdForEntityRequest {
  entity: string;
}

interface GetNextIdForEntityResponse {
  nextId: number;
}

export class GetNextIdForEntity {
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Get the next id for the entity
   *
   * @param {string} entity The entity to get the next id for
   * @returns {number} The next id for the entity
   */
  async execute({ entity }: GetNextIdForEntityRequest): Promise<GetNextIdForEntityResponse> {
    const [ids, error] = await executePromise(
      this.firebird.execute<{ gen_id: number }>(`select gen_id(gen_${entity}_id, 1) from rdb$database`)
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
