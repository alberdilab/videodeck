export function nowIso(): string {
  return new Date().toISOString();
}

export function secondsBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000));
}
