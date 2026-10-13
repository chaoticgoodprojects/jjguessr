/**
 * Loose title matching for typed guesses: "dont stop me now" should count for
 * "Don't Stop Me Now - Remastered 2011", but "stop" should not.
 */

const SIMILARITY_NEEDED = 0.85;
/** Titles shorter than this (after normalizing) must match exactly; one typo in "Hello" is a different word. */
const FUZZY_MIN_LENGTH = 5;

export function normalizeTitle(raw: string): string {
  let s = raw.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  // Drop bracketed extras: (feat. X), [Remastered], (Live at Wembley)
  s = s.replace(/\s*[([{][^)\]}]*[)\]}]/g, " ");
  // Drop Spotify-style suffixes: "Song - Remastered 2011", "Song - Live", "Song - Radio Edit"
  s = s.replace(/\s+[-–—]\s+.*$/, "");
  // Drop "feat. X" / "ft. X" written without brackets
  s = s.replace(/\s+(feat|ft|featuring)\.?\s.*$/, "");
  s = s.replace(/&/g, " and ");
  s = s.replace(/['’`]/g, "");
  s = s.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  s = s.replace(/^the\s+/, "");
  return s.replace(/\s+/g, " ");
}

/** Album names get the same treatment, so "Weezer (Blue Album)" by Weezer reads as self-titled. */
export function isSelfTitled(artist: string, album: string): boolean {
  const a = normalizeTitle(artist);
  return a.length > 0 && a === normalizeTitle(album);
}

export function titleMatches(guess: string, title: string): boolean {
  const g = normalizeTitle(guess);
  const t = normalizeTitle(title);
  if (g.length === 0 || t.length === 0) return false;
  if (g === t) return true;
  if (t.length < FUZZY_MIN_LENGTH) return false;
  return similarity(g, t) >= SIMILARITY_NEEDED;
}

function similarity(a: string, b: string): number {
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = row;
  }
  return prev[b.length]!;
}
