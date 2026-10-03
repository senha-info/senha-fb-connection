const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    });

    formatterCache.set(timeZone, formatter);
  }

  return formatter;
}

interface DateTimeParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Extrai partes de data no horário local da máquina
 */
function getLocalDateParts(date: Date): DateTimeParts {
  return {
    year: String(date.getFullYear()),
    month: pad(date.getMonth() + 1),
    day: pad(date.getDate()),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
    second: pad(date.getSeconds()),
  };
}

/**
 * Extrai partes de data convertendo para um timeZone específico
 */
function getTimeZoneParts(date: Date, timeZone: string): DateTimeParts {
  const formatter = getDateTimeFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};

  for (let i = 0; i < parts.length; i++) {
    map[parts[i].type] = parts[i].value;
  }

  return {
    year: map.year ?? '1970',
    month: map.month ?? '01',
    day: map.day ?? '01',
    hour: map.hour ?? '00',
    minute: map.minute ?? '00',
    second: map.second ?? '00',
  };
}

function getDateTimeParts(date: Date, timeZone?: string): DateTimeParts {
  return timeZone ? getTimeZoneParts(date, timeZone) : getLocalDateParts(date);
}

/**
 * Formata um objeto Date para formato TIMESTAMP compatível com Firebird: 'YYYY-MM-DD HH:mm:ss'
 */
export function formatTimestamp(date: Date, timeZone?: string): string {
  const p = getDateTimeParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Formata um objeto Date para formato DATE compatível com Firebird: 'YYYY-MM-DD'
 */
export function formatDate(date: Date, timeZone?: string): string {
  const p = getDateTimeParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Formata um objeto Date para formato TIME compatível com Firebird: 'HH:mm:ss'
 */
export function formatTime(date: Date, timeZone?: string): string {
  const p = getDateTimeParts(date, timeZone);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Formata um Date baseado no tipo de coluna Firebird (12: Date, 13: Time, 35/outro: Timestamp)
 */
export function formatDateTimeByType(date: Date, type?: number, timeZone?: string): string {
  if (type === 12) {
    return formatDate(date, timeZone);
  }

  if (type === 13) {
    return formatTime(date, timeZone);
  }

  return formatTimestamp(date, timeZone);
}
