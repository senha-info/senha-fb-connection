import { executePromise } from "@senhainfo/shared-utils";
import { FirebirdConnection } from "./connection";

interface GetDataFromTableRequest {
  table: string;
  columns: string[];
  conditions?: string[];
  joins?: string[];
  orderBy?: string[];
}

type GetDataFromTableResponse = {
  [key: string]: any;
};

export class GetDataFromTable {
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Get any data from a table, allowing joins and filters
   *
   * @param {GetDataFromTableRequest} request Request object
   * @param {string[]} [request.columns] Columns to be selected
   * @param {string[]} [request.conditions] Filters to be applied
   * @param {string[]} [request.joins] Joins to be applied
   * @param {string[]} [request.orderBy] Order by to be applied
   * @returns {Promise<string>}
   */
  async execute<T>({
    table,
    columns,
    conditions,
    joins = [],
    orderBy,
  }: GetDataFromTableRequest): Promise<T extends GetDataFromTableResponse ? T : GetDataFromTableResponse> {
    const query = `
      select ${columns.join(",")}
      from ${table}
      ${joins.join(" ")}
      ${conditions && conditions.length ? `where ${conditions.join(" and ")}` : ""}
      ${orderBy && orderBy.length ? `order by ${orderBy.join(",")}` : ""}
    `;

    const [rows, error] = await executePromise(this.firebird.execute<any>(query));

    if (error) {
      throw new Error(error);
    }

    const [row] = rows;

    return row;
  }
}
