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
 * Extracts date parts in the local machine timezone.
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
 * Extracts date parts converted to a specific timezone.
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

/**
 * Resolves date parts using either a specified timezone or local machine time.
 */
function getDateTimeParts(date: Date, timeZone?: string): DateTimeParts {
  return timeZone ? getTimeZoneParts(date, timeZone) : getLocalDateParts(date);
}

/**
 * Formats a Date object into a Firebird-compatible TIMESTAMP string: 'YYYY-MM-DD HH:mm:ss'.
 *
 * @param date Date object to format.
 * @param timeZone Optional IANA timezone identifier (e.g. 'America/Sao_Paulo').
 * @returns Formatted timestamp string.
 */
export function formatTimestamp(date: Date, timeZone?: string): string {
  const p = getDateTimeParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Formats a Date object into a Firebird-compatible DATE string: 'YYYY-MM-DD'.
 *
 * @param date Date object to format.
 * @param timeZone Optional IANA timezone identifier (e.g. 'America/Sao_Paulo').
 * @returns Formatted date string.
 */
export function formatDate(date: Date, timeZone?: string): string {
  const p = getDateTimeParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Formats a Date object into a Firebird-compatible TIME string: 'HH:mm:ss'.
 *
 * @param date Date object to format.
 * @param timeZone Optional IANA timezone identifier (e.g. 'America/Sao_Paulo').
 * @returns Formatted time string.
 */
export function formatTime(date: Date, timeZone?: string): string {
  const p = getDateTimeParts(date, timeZone);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Formats a Date based on the Firebird column type (12 = DATE, 13 = TIME, 35/other = TIMESTAMP).
 *
 * @param date Date object to format.
 * @param type Firebird field type code.
 * @param timeZone Optional IANA timezone identifier.
 * @returns Formatted date/time string.
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
