interface Condition<T> {
  value: T;
  apply: boolean;
  text: (value: NonNullable<T>) => string;
}

export function buildWhere<T>(conditions: Condition<T>[]): string {
  const where = conditions
    .filter((condition) => condition.apply && condition.value !== undefined)
    .map((condition) => condition.text(condition.value!))
    .join(" and ");

  return where ? `where ${where}` : "";
}
