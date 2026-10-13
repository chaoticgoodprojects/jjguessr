/**
 * Reads the songs in a public Spotify playlist from Spotify's embed player
 * page, with no sign-in. This is not an official API: Spotify can change or
 * block the page at any time, so every failure comes back as a plain message
 * and the host can fall back to a built-in pack.
 *
 * The page lists each song's title and artists but not its album, so songs
 * from here have `album: null` and only the artist can be revealed.
 */
import type { Song } from "../rules";

export type PlaylistResult = { ok: true; name: string; songs: Song[] } | { ok: false; message: string };

const PLAYLIST_ID = /^[A-Za-z0-9]{22}$/;
const EMBED_URL = "https://open.spotify.com/embed/playlist/";
const MAX_SONGS = 500;

/**
 * Accepts the forms people paste: a share link (with or without ?si= and a
 * /intl-xx/ prefix), a spotify:playlist: URI, or the bare id.
 */
export function playlistIdFrom(input: string): string | null {
  const s = input.trim();
  if (PLAYLIST_ID.test(s)) return s;
  const uri = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(s);
  if (uri) return uri[1]!;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.hostname !== "open.spotify.com" && url.hostname !== "play.spotify.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("playlist");
  const id = i >= 0 ? parts[i + 1] : undefined;
  return id && PLAYLIST_ID.test(id) ? id : null;
}

export async function fetchPublicPlaylist(id: string, fetcher: typeof fetch = fetch): Promise<PlaylistResult> {
  let res: Response;
  try {
    res = await fetcher(EMBED_URL + id, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; jjguessr; +https://github.com/chaoticgoodprojects/jjguessr)",
        "Accept-Language": "en",
      },
    });
  } catch {
    return { ok: false, message: "Couldn't reach Spotify. Try again, or pick a song pack." };
  }
  if (res.status === 404) return { ok: false, message: "Spotify says that playlist doesn't exist or isn't public." };
  if (!res.ok) return { ok: false, message: "Spotify didn't share that playlist. Try again, or pick a song pack." };
  return parseEmbedPage(await res.text());
}

/** Pulls the playlist out of the embed page's Next.js data blob. */
export function parseEmbedPage(html: string): PlaylistResult {
  const unreadable = { ok: false, message: "Couldn't read that playlist from Spotify. Pick a song pack instead." } as const;
  const m = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return unreadable;
  let data: unknown;
  try {
    data = JSON.parse(m[1]!);
  } catch {
    return unreadable;
  }
  const entity = findEntity(data);
  if (!entity) return unreadable;

  const seen = new Set<string>();
  const songs: Song[] = [];
  for (const item of entity.trackList) {
    if (typeof item !== "object" || item === null) continue;
    const t = item as Record<string, unknown>;
    const title = clean(t.title);
    const artist = clean(t.subtitle);
    const id = typeof t.uri === "string" ? t.uri : `${title}|${artist}`;
    if (!title || !artist || seen.has(id)) continue;
    seen.add(id);
    songs.push({ id, title, artist, album: null });
    if (songs.length >= MAX_SONGS) break;
  }
  if (songs.length === 0) return { ok: false, message: "That playlist has no songs we can use." };
  return { ok: true, name: clean(entity.name) || clean(entity.title) || "Spotify playlist", songs };
}

/**
 * The entity usually sits at props.pageProps.state.data.entity; search for
 * any object with a trackList so a small reshuffle of the page doesn't break us.
 */
function findEntity(node: unknown, depth = 0): { trackList: unknown[]; name?: unknown; title?: unknown } | null {
  if (depth > 12 || typeof node !== "object" || node === null) return null;
  const o = node as Record<string, unknown>;
  if (Array.isArray(o.trackList)) return o as { trackList: unknown[] };
  for (const v of Object.values(o)) {
    const found = findEntity(v, depth + 1);
    if (found) return found;
  }
  return null;
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}
