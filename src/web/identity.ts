/**
 * This browser's seat token and last-used name. The token is what lets a
 * player reload or reconnect and land back in the same seat. Storage can be
 * blocked (private windows), so everything falls back to memory.
 */
const TOKEN_KEY = "jjguessr.token";
const NAME_KEY = "jjguessr.name";
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kept in memory only.
  }
}

export function seatToken(): string {
  let token = read(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    write(TOKEN_KEY, token);
  }
  return token;
}

export function lastName(): string {
  return read(NAME_KEY) ?? "";
}

export function rememberName(name: string): void {
  write(NAME_KEY, name);
}
