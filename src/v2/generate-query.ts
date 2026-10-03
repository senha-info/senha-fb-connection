import { FirebirdConnection } from './connection.js';
import type { GenerateQueryRequest, GenerateQueryResponse } from './types.js';
import { formatDateTimeByType } from './utils/date.js';

interface FieldMetadata {
  flength: number;
  ftype: number;
}

interface ToQueryProps {
  value: unknown;
  key: string;
  preserveCase?: boolean;
  type: 'upsert' | 'update';
  fieldMetadata?: FieldMetadata;
}

const TAB_SPACE = '\n  ';

// Firebird string field types: 14 = CHAR, 37 = VARCHAR, 40 = CSTRING
const STRING_FIELD_TYPES = new Set([14, 37, 40]);

/**
 * Utility class for generating dynamic SQL queries (upsert and update)
 * with automatic table metadata reflection, field length trimming, and type formatting.
 */
export class GenerateQuery<K extends string = string> {
  /**
   * Creates a new GenerateQuery instance.
   *
   * @param firebird Active FirebirdConnection instance used for metadata reflection and escaping.
   */
  constructor(private firebird: FirebirdConnection) {}

  private metadataCache = new Map<string, Map<string, FieldMetadata>>();

  private async getTableMetadata(table: string): Promise<Map<string, FieldMetadata>> {
    const tableKey = table.toUpperCase();
    const cached = this.metadataCache.get(tableKey);

    if (cached) {
      return cached;
    }

    const query = `
      SELECT 
        RF.RDB$FIELD_NAME FNAME, 
        COALESCE(F.RDB$CHARACTER_LENGTH, F.RDB$FIELD_LENGTH) FLENGTH, 
        F.RDB$FIELD_TYPE FTYPE
      FROM RDB$RELATION_FIELDS RF
      INNER JOIN RDB$FIELDS F ON RF.RDB$FIELD_SOURCE = F.RDB$FIELD_NAME
      WHERE UPPER(RF.RDB$RELATION_NAME) = ?
    `;

    const fields = await this.firebird.execute<{
      fname: string;
      flength: number;
      ftype: number;
    }>(query, [tableKey]);

    const metadata = new Map<string, FieldMetadata>();

    for (const field of fields ?? []) {
      const fieldAny = field as unknown as Record<string, unknown>;
      const rawFname = (field.fname ?? fieldAny.FNAME) as string | undefined;
      const rawFlength = (field.flength ?? fieldAny.FLENGTH) as number | undefined;
      const rawFtype = (field.ftype ?? fieldAny.FTYPE) as number | undefined;

      if (rawFname) {
        metadata.set(rawFname.trim().toUpperCase(), {
          flength: rawFlength ?? 0,
          ftype: rawFtype ?? 0,
        });
      }
    }

    this.metadataCache.set(tableKey, metadata);

    return metadata;
  }

  /**
   * Clears the cached table column metadata.
   *
   * @param table Optional table name. If omitted, clears cache for all tables.
   */
  public clearMetadataCache(table?: string): void {
    if (table) {
      this.metadataCache.delete(table.toUpperCase());
    } else {
      this.metadataCache.clear();
    }
  }

  private toQuery({ value, key, preserveCase, type, fieldMetadata }: ToQueryProps): string {
    if (fieldMetadata) {
      const { flength, ftype } = fieldMetadata;

      if (typeof value === 'string') {
        if (STRING_FIELD_TYPES.has(ftype)) {
          value = preserveCase ? value.trim().slice(0, flength) : value.toUpperCase().trim().slice(0, flength);
        }
      } else if (value instanceof Date) {
        value = formatDateTimeByType(value, ftype, this.firebird.timeZone);
      }
    } else if (value instanceof Date) {
      value = formatDateTimeByType(value, undefined, this.firebird.timeZone);
    }

    if (typeof value === 'boolean') {
      value = value ? 1 : 0;
    }

    let escapedValue = this.firebird.escape(value);

    if (type === 'update') {
      escapedValue = `${key} = ${escapedValue}`;
    }

    return escapedValue;
  }

  /**
   * Generates dynamic upsert or update SQL statements based on table metadata.
   * Automatically trims strings according to column length limits and formats dates.
   *
   * @template T Entity data model type.
   * @param request Query generation options including table name, payload, and primary key.
   * @returns Object containing the generated query and formatted columns/values snippets.
   */
  async execute<T>({
    type = 'upsert',
    table,
    data,
    primaryKey,
    preserveCase = [],
    matching,
    returning = [primaryKey],
  }: GenerateQueryRequest<T, K>): Promise<GenerateQueryResponse> {
    // Clone data object to prevent mutating caller's original object
    const payload = { ...data };

    for (const key of Object.keys(payload)) {
      if (payload[key as keyof typeof payload] === undefined) {
        delete payload[key as keyof typeof payload];
      }
    }

    const primaryKeyValue = payload[primaryKey as keyof typeof payload];

    if (type === 'upsert') {
      if (!matching && !Object.prototype.hasOwnProperty.call(payload, primaryKey)) {
        payload[primaryKey as keyof typeof payload] = null;
      }
    } else if (type === 'update') {
      if (primaryKeyValue === undefined || primaryKeyValue === null) {
        throw new Error(
          `[GenerateQuery] A non-null primaryKey "${String(primaryKey)}" must be provided in data for UPDATE operations.`,
        );
      }

      // In UPDATE operations, primary key belongs in the WHERE clause and must not appear in the SET clause
      delete payload[primaryKey as keyof typeof payload];
    }

    const tableMetadata = await this.getTableMetadata(table);

    const columns: string[] = [];
    const values: string[] = [];
    const keys = Object.keys(payload);

    if (keys.length === 0) {
      throw new Error(`[GenerateQuery] No fields provided for ${type} on table "${table}".`);
    }

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const fieldMetadata = tableMetadata.get(key.toUpperCase());
      const shouldPreserveCase = preserveCase.includes(key as keyof typeof data);

      const value = this.toQuery({
        value: payload[key as keyof typeof payload],
        key,
        preserveCase: shouldPreserveCase,
        type,
        fieldMetadata,
      });

      columns.push(key);
      values.push(value);
    }

    let query = '';

    const columnsStr = TAB_SPACE + columns.join(`,${TAB_SPACE}`) + '\n';
    const valuesStr = TAB_SPACE + values.join(`,${TAB_SPACE}`) + '\n';

    if (type === 'upsert') {
      const matchClause = String(matching?.join(', ') ?? primaryKey);
      query =
        `update or insert into ${table} (${columnsStr}) ` +
        `values (${valuesStr}) ` +
        `matching (${matchClause}) ` +
        `returning ${returning.join(', ')}`;
    }

    if (type === 'update') {
      query =
        `update ${table} set` +
        `${valuesStr}` +
        `where ${String(primaryKey)} = ${this.firebird.escape(primaryKeyValue)}`;
    }

    return {
      query,
      columns: columnsStr,
      values: valuesStr,
    };
  }
}
