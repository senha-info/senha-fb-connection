import { executePromise } from "@senhainfo/shared-utils";
import { PartialNullable } from "./@types/partial-nullable";
import { FirebirdConnection, escape } from "./connection";

interface GenerateQueryRequest<T> {
  type?: "upsert" | "update";
  table: string;
  data: PartialNullable<T>;
  primaryKey: keyof T;
  ignoreCasing?: (keyof T)[];
  ignoreCharacterSet?: (keyof T)[];
  matching?: (keyof T)[];
  returning?: (keyof T)[] | ["*"];
}

interface GenerateQueryResponse {
  query: string;
  columns: string;
  values: string;
}

interface ToQueryProps {
  value: string | number;
  table: string;
  key: string;
  originalCase?: boolean;
  originalCharacterSet?: boolean;
  type: "upsert" | "update";
}

export class FirebirdGenerateQuery {
  constructor(private firebird: FirebirdConnection) {}

  private async toQuery({ value, table, key, originalCase, originalCharacterSet, type }: ToQueryProps) {
    if (typeof value === "string") {
      const query = `
        select f.rdb$field_length flength, f.rdb$field_type ftype
        from rdb$relation_fields rf
        inner join rdb$fields f on rf.rdb$field_source = f.rdb$field_name
        where
          upper(rf.rdb$relation_name) = ${escape(table.toUpperCase())}
          and
          upper(rf.rdb$field_name) = ${escape(key.toUpperCase())}
      `;

      const [fields, error] = await executePromise(this.firebird.execute<{ flength: number; ftype: number }>(query));

      if (error) {
        throw new Error(error);
      }

      if (!fields) {
        return type === "upsert" ? escape(value) : `${key} = ${escape(value)}`;
      }

      const [{ flength, ftype }] = fields;

      // 12 - Date | 13 - Time | 35 - Timestamp | 261 - Blob
      if (!(ftype === 12) && !(ftype === 13) && !(ftype === 35) && !(ftype === 261)) {
        if (originalCase) {
          value = value.trim().slice(0, flength);
        } else {
          value = value.toUpperCase().trim().slice(0, flength);
        }
      }

      if (type === "upsert") {
        if (originalCharacterSet) {
          value = `cast(${escape(value)} as varchar(${value.length || 1}))`;
        } else {
          value = `cast(${escape(value)} as varchar(${value.length || 1}) character set WIN1252)`;
        }
      } else {
        if (originalCharacterSet) {
          value = `${key} = cast(${escape(value)} as varchar(${value.length || 1}))`;
        } else {
          value = `${key} = cast(${escape(value)} as varchar(${value.length || 1}) character set WIN1252)`;
        }
      }

      return value;
    }

    return type === "upsert" ? escape(value) : `${key} = ${escape(value)}`;
  }

  /**
   * Generate Firebird query
   *
   * @param {GenerateQueryRequest<T>} request Request object
   * @param {string} request.table Table name
   * @param {PartialNullable<T>} request.data Data to be inserted or updated
   * @param {keyof T} request.primaryKey Primary key of the table
   * @param {keyof T[]} [request.ignoreCasing] Columns to ignore casing
   * @param {keyof T[]} [request.matching] Columns to match
   * @param {keyof T[]} [request.returning] Columns to return
   * @returns {Promise<GenerateQueryResponse>} Generated query parts
   */
  async execute<T>({
    type = "upsert",
    table,
    data,
    primaryKey,
    ignoreCasing = [],
    ignoreCharacterSet = [],
    matching,
    returning = [primaryKey],
  }: GenerateQueryRequest<T>): Promise<GenerateQueryResponse> {
    for (const key in data) {
      if (data[key] === undefined) {
        delete data[key];
      }
    }

    if (!data.hasOwnProperty(primaryKey)) {
      data[primaryKey as keyof typeof data] = null;
    }

    if (matching) {
      delete data[primaryKey];
    }

    const columns = [];
    const values = [];
    const keys = Object.keys(data);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      const originalCase = ignoreCasing.includes(key as keyof typeof data);
      const originalCharacterSet = ignoreCharacterSet.includes(key as keyof typeof data);

      const value = await this.toQuery({
        value: data[key as keyof typeof data] as string | number,
        table,
        key,
        originalCase,
        originalCharacterSet,
        type,
      });

      columns.push(key);
      values.push(value);
    }

    let query = "";
    const columnsStr = columns.join(",\n\t\t");
    const valuesStr = values.join(",\n\t\t");

    if (type === "upsert") {
      query = `
        update or insert into ${table} (
        \t\t${columnsStr}
        ) values (
        \t\t${valuesStr}
        ) matching (${String(matching?.join(", ") ?? primaryKey)}) returning ${returning.join(", ")}
      `;
    }

    if (type === "update") {
      query = `
        update ${table} set
          ${valuesStr}
        where ${String(primaryKey)} = ${escape(data[primaryKey as keyof typeof data])}
      `;
    }

    return {
      query,
      columns: columnsStr,
      values: valuesStr,
    };
  }
}
