export function cast(attribute: string, maxLength = 60) {
  return `cast(${attribute} as varchar(${maxLength}) character set WIN1252) as ${attribute}`;
}
