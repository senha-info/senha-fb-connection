import type { WhereParams } from './types.js';
import { formatTimestamp } from './utils/date.js';

/**
 * Serializes a value into a SQL string representation.
 */
function serialize(value: unknown, timeZone?: string): string {
  if (value instanceof Date) return formatTimestamp(value, timeZone);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

/**
 * Dynamically builds a SQL WHERE clause based on active conditions and non-null values.
 *
 * @param params List of parameter configurations containing value, boolean condition, and query builder function.
 * @param timeZone Optional timezone identifier for date conversions (e.g. `'America/Sao_Paulo'`).
 * @returns Formatted WHERE clause prefixed with `' where '` or an empty string if no conditions apply.
 */
export function buildWhere(params: WhereParams[], timeZone?: string): string {
  const where = params
    .filter((param) => param.condition && param.value != null)
    .map((param) => param.query(serialize(param.value, timeZone)))
    .join(' and ');

  return where ? ` where ${where} ` : '';
}
