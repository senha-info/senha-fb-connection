import { FirebirdConnection } from './connection.js';
import type { GenericResponse, GetDataFromTableRequest, GetDataFromTableResponse } from './types.js';

/**
 * Utility class for querying rows from a table with support for projections, joins, conditions, ordering, and pagination.
 */
export class GetDataFromTable {
  /**
   * Creates a new GetDataFromTable instance.
   *
   * @param firebird Active FirebirdConnection instance.
   */
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Queries records from a table with support for selected columns, joins, WHERE conditions, ordering, and row pagination.
   *
   * @template T Expected record type. Defaults to GenericResponse.
   * @param request Table query parameters.
   * @returns Array of matching records.
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
