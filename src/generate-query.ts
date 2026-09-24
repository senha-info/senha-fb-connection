import { executePromise } from '@senhainfo/shared-utils';
import { PartialNullable } from './@types/partial-nullable';
import { FirebirdConnection } from './connection';

interface GenerateQueryRequest<T, K extends string> {
  type?: 'upsert' | 'update';
  table: K;
  data: PartialNullable<T>;
  primaryKey: keyof T;
  ignoreCase?: (keyof T)[];
  matching?: (keyof T)[];
  returning?: (keyof T)[] | ['*'];
}

interface GenerateQueryResponse {
  query: string;
  columns: string;
  values: string;
}

interface FieldMetadata {
  flength: number;
  ftype: number;
}

interface ToQueryProps {
  value: string | number | Date;
  key: string;
  originalCase?: boolean;
  type: 'upsert' | 'update';
  fieldMetadata?: FieldMetadata;
}

const SPACE_CHAR = '\u0020';
const TAB_SPACE = `\n${SPACE_CHAR.repeat(2)}`;

export class FirebirdGenerateQuery<K extends string> {
  constructor(private firebird: FirebirdConnection) {}

  private metadataCache = new Map<string, Map<string, FieldMetadata>>();

  private async getTableMetadata(table: string): Promise<Map<string, FieldMetadata>> {
    const cached = this.metadataCache.get(table);

    if (cached) {
      return cached;
    }

    const query = `
      select rf.rdb$field_name fname, f.rdb$field_length flength, f.rdb$field_type ftype
      from rdb$relation_fields rf
      inner join rdb$fields f on rf.rdb$field_source = f.rdb$field_name
      where upper(rf.rdb$relation_name) = ${this.firebird.escape(table.toUpperCase())}
    `;

    const [fields, error] = await executePromise(
      this.firebird.execute<{ fname: string; flength: number; ftype: number }>(query),
    );

    if (error) {
      throw new Error(error);
    }

    const metadata = new Map<string, FieldMetadata>();

    for (const field of fields ?? []) {
      metadata.set(field.fname.trim().toUpperCase(), {
        flength: field.flength,
        ftype: field.ftype,
      });
    }

    this.metadataCache.set(table, metadata);

    return metadata;
  }

  public clearMetadataCache(table?: string) {
    if (table) {
      this.metadataCache.delete(table);
    } else {
      this.metadataCache.clear();
    }
  }

  private formatDateTime(value: Date, type: number) {
    let parsedValue: string | Date = value;

    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(value);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

    // 12 = Date
    if (type === 12) {
      parsedValue = `${get('year')}-${get('month')}-${get('day')}`;
    }

    // 13 = Time
    if (type === 13) {
      parsedValue = `${get('hour')}:${get('minute')}:${get('second')}`;
    }

    // 35 = Timestamp
    if (type === 35) {
      parsedValue = new Date(
        `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`,
      );
    }

    return parsedValue || '';
  }

  private async toQuery({ value, key, originalCase, type, fieldMetadata }: ToQueryProps) {
    if (!fieldMetadata) {
      return type === 'upsert' ? this.firebird.escape(value) : `${key} = ${this.firebird.escape(value)}`;
    }

    const { flength, ftype } = fieldMetadata;

    if (typeof value === 'string') {
      value = value.replace(/\\/g, '/');

      // 261 - Blob
      if (ftype !== 261) {
        if (originalCase) {
          value = value.trim().slice(0, flength);
        } else {
          value = value.toUpperCase().trim().slice(0, flength);
        }
      }
    }

    if (value instanceof Date) {
      value = this.formatDateTime(value, ftype);
    }

    value = this.firebird.escape(value);

    if (type === 'update') {
      value = `${key} = ${value}`;
    }

    return value;
  }

  /**
   * Generate Firebird query
   *
   * @param {GenerateQueryRequest<T>} request Request object
   * @param {string} request.type Query type (upsert | update)
   * @param {string} request.table Table name
   * @param {PartialNullable<T>} request.data Data to be inserted or updated
   * @param {keyof T} request.primaryKey Primary key of the table
   * @param {keyof T[]} [request.ignoreCase] Columns to ignore case
   * @param {keyof T[]} [request.matching] Columns to match
   * @param {keyof T[]} [request.returning] Columns to return
   * @returns {Promise<GenerateQueryResponse>} Generated query parts
   */
  async execute<T>({
    type = 'upsert',
    table,
    data,
    primaryKey,
    ignoreCase = [],
    matching,
    returning = [primaryKey],
  }: GenerateQueryRequest<T, K>): Promise<GenerateQueryResponse> {
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

    const tableMetadata = await this.getTableMetadata(table);

    const columns = [];
    const values = [];
    const keys = Object.keys(data);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      const originalCase = ignoreCase.includes(key as keyof typeof data);
      const fieldMetadata = tableMetadata.get(key.toUpperCase());

      const value = await this.toQuery({
        value: data[key as keyof typeof data] as string | number | Date,
        key,
        originalCase,
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
      query =
        `update or insert into ${table} (` +
        `${columnsStr}` +
        ') values (' +
        `${valuesStr}` +
        `) matching (${String(matching?.join(', ') ?? primaryKey)}) returning ${returning.join(', ')}`;
    }

    if (type === 'update') {
      query =
        `update ${table} set` +
        `${valuesStr}` +
        'where' +
        `${TAB_SPACE}${String(primaryKey)} = ${this.firebird.escape(data[primaryKey as keyof typeof data])}`;
    }

    return {
      query,
      columns: columnsStr,
      values: valuesStr,
    };
  }
}
