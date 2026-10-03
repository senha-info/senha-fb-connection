import type { WhereParams } from './types.js';
import { formatTimestamp } from './utils/date.js';

function serialize(value: unknown, timeZone?: string): string {
  if (value instanceof Date) return formatTimestamp(value, timeZone);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

/**
 * Constrói dinamicamente uma cláusula WHERE baseada em condições ativas.
 *
 * @param params Lista de parâmetros contendo valor, condição booleana e função construtora
 * @param timeZone Fuso horário opcional para conversão de datas (ex: 'America/Sao_Paulo', 'Europe/Lisbon')
 * @returns Cláusula WHERE formatada ou string vazia
 */
export function buildWhere(params: WhereParams[], timeZone?: string): string {
  const where = params
    .filter((param) => param.condition && param.value != null)
    .map((param) => param.query(serialize(param.value, timeZone)))
    .join(' and ');

  return where ? ` where ${where} ` : '';
}
