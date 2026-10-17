// Refuse the judge ports before any socket is opened. Mocks bind port 0.
export const FORBIDDEN_PORTS = [8090, 18090] as const;

export function assertFetchAllowed(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.port === "") return;
  const port = Number(parsed.port);
  if (!Number.isInteger(port)) return;
  if ((FORBIDDEN_PORTS as readonly number[]).includes(port)) {
    throw new Error(`PORT-FORBIDDEN:${port}`);
  }
}
