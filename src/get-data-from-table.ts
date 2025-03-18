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

  async execute({
    table,
    columns,
    conditions,
    joins = [],
    orderBy = [],
  }: GetDataFromTableRequest): Promise<GetDataFromTableResponse> {
    const query = `
      select ${columns.join(",")}
      from ${table}
      ${joins.join(" ")}
      ${conditions ? `where ${conditions.join(" and ")}` : ""}
      ${orderBy ? `order by ${orderBy.join(",")}` : ""}
    `;

    const [rows, error] = await executePromise(this.firebird.execute<any>(query));

    if (error) {
      throw new Error(error);
    }

    const [row] = rows;

    return row;
  }
}
