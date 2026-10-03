import { FirebirdConnection } from './connection.js';
import type { GetNextSequenceRequest, GetNextSequenceResponse } from './types.js';

/**
 * Utility class for retrieving the next value of a Firebird generator/sequence.
 */
export class GetNextSequence {
  /**
   * Creates a new GetNextSequence instance.
   *
   * @param firebird Active FirebirdConnection instance.
   */
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Retrieves the next sequential value from a Firebird generator/sequence using `GEN_ID(name, 1)`.
   *
   * @param request Generator parameters containing generator name and naming convention flag.
   * @returns Object containing the next sequence value.
   */
  async execute({ generator, isTableId = true }: GetNextSequenceRequest): Promise<GetNextSequenceResponse> {
    const rawName = isTableId ? `gen_${generator}_id` : `gen_${generator}`;
    const name = rawName.replace(/[^a-zA-Z0-9_$]/g, '');

    const ids = await this.firebird.execute<{ gen_id: number }>(
      `select gen_id(${name}, 1) as gen_id from rdb$database`,
    );

    if (!ids || ids.length === 0) {
      throw new Error(`[GetNextSequence] Failed to get sequence for generator "${name}".`);
    }

    const idRow = ids[0] as unknown as Record<string, unknown>;
    const nextSequence = Number(idRow.gen_id ?? idRow.GEN_ID);

    return {
      nextSequence,
    };
  }
}
