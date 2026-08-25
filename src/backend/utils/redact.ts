const CREDENTIAL_PATTERN = /(rtsp:\/\/)([^:@/\s]+):([^@/\s]+)@/gi;

export function redactCredentials(value: string): string {
  return value.replace(CREDENTIAL_PATTERN, '$1$2:****@');
}

export function redactObject<T>(value: T): T {
  if (typeof value === 'string') {
    return redactCredentials(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        key.toLowerCase().includes('password') ? '****' : redactObject(entry)
      ])
    ) as T;
  }

  return value;
}
