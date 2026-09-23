import { escape } from 'node-firebird'

interface WhereParams {
  value: unknown;
  condition: boolean;
  query: (value: string) => string;
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

/** Timestamp em hora local: "2026-09-23 14:30:00" */
function formatLocalTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/** Timestamp em UTC: "2026-09-23 17:30:00" (use no lugar do local se o banco guarda em UTC) */
export function formatUtcTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function serialize(value: unknown): string {
  if (value instanceof Date) return formatLocalTimestamp(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return escape(String(value))
}

export function buildWhere(params: WhereParams[]) {
  const where = params
    .filter((param) => param.condition && param.value !== undefined)
    .map((param) => param.query(serialize(param.value)))
    .join(' and ');

  return where ? `where ${where}` : '';
}
