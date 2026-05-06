export async function getPLimit() {
  const mod = await import('p-limit');
  return mod.default;
}
