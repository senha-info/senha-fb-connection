import * as Firebird from 'node-firebird';

export function cast(attribute: string, maxLength = 60, charset: Firebird.SupportedCharacterSet = 'WIN1252') {
  return `cast(${attribute} as varchar(${maxLength}) character set ${charset}) as ${attribute}`;
}
