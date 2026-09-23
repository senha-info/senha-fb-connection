import { escape } from 'node-firebird';

interface WhereParams {
  value: unknown;
  condition: boolean;
  query: (value: string) => string;
}

function formatUtcTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function serialize(value: unknown): string {
  if (value instanceof Date) return formatUtcTimestamp(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

export function buildWhere(params: WhereParams[]) {
  const where = params
    .filter((param) => param.condition && param.value !== undefined)
    .map((param) => param.query(serialize(param.value)))
    .join(' and ');

  return where ? ` where ${where} ` : '';
}
