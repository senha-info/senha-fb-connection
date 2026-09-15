import { executePromise } from '@senhainfo/shared-utils';
import { FirebirdConnection } from './connection';

interface GetNextSequenceRequest {
  generator: string;
  isTableId?: boolean;
}

interface GetNextSequenceResponse {
  nextSequence: number;
}

export class GetNextSequence {
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Get the next sequence for a generator
   *
   * @param {string} generator The generator to get the next sequence for
   * @returns {number} The next sequence for the generator
   */
  async execute({ generator, isTableId = true }: GetNextSequenceRequest): Promise<GetNextSequenceResponse> {
    const name = isTableId ? `gen_${generator}_id` : `gen_${generator}`;

    const [ids, error] = await executePromise(
      this.firebird.execute<{ gen_id: number }>(`select gen_id(${this.firebird.escape(name)}, 1) from rdb$database`),
    );

    if (error) {
      throw new Error(error);
    }

    const [{ gen_id }] = ids;

    return {
      nextSequence: gen_id,
    };
  }
}
