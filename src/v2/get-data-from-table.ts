import { FirebirdConnection } from './connection.js';
import type { GenericResponse, GetDataFromTableRequest, GetDataFromTableResponse } from './types.js';

export class GetDataFromTable {
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Consulta dados de uma tabela com suporte a colunas, junções (joins), filtros e paginação.
   *
   * @param request Parâmetros da consulta
   * @returns Lista de registros encontrados
   */
  async execute<T = GenericResponse>({
    table,
    columns,
    conditions,
    joins = [],
    orderBy,
    limit,
    offset,
  }: GetDataFromTableRequest): Promise<GetDataFromTableResponse<T>[]> {
    const rowsClause = limit
      ? `rows ${(offset || 0) + 1} to ${(offset || 0) + limit}`
      : offset
        ? `rows ${offset + 1} to 999999999`
        : '';

    const selectedColumns = columns && columns.length > 0 ? columns.join(', ') : '*';

    const query = `
      select ${selectedColumns}
      from ${table}
      ${joins.join(' ')}
      ${conditions && conditions.length ? `where ${conditions.join(' and ')}` : ''}
      ${orderBy && orderBy.length ? `order by ${orderBy.join(', ')}` : ''}
      ${rowsClause}
    `;

    return this.firebird.execute<GetDataFromTableResponse<T>>(query);
  }
}
