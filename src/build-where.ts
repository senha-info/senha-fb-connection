interface WhereParams {
  value: unknown;
  condition: boolean;
  query: (value: string) => string;
}

export function buildWhere(params: WhereParams[]) {
  const where = params
    .filter((param) => param.condition && param.value !== undefined)
    .map((param) => param.query(String(param.value)))
    .join(" and ");

  return where ? `where ${where}` : "";
}
