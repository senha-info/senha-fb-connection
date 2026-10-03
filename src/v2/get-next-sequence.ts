import { FirebirdConnection } from './connection.js';
import type { GetNextSequenceRequest, GetNextSequenceResponse } from './types.js';

export class GetNextSequence {
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Obtém o próximo valor sequencial de um gerador (generator) Firebird
   *
   * @param request Parâmetros contendo o nome do generator
   * @returns Próximo número de sequência
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
