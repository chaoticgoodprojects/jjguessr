import { describe, expect, it } from "vitest";
import { fetchPublicPlaylist, parseEmbedPage, playlistIdFrom } from "./spotify";

const ID = "37i9dQZF1DXcBWIGoYBM5M";

/** Shaped like Spotify's embed page: a Next.js data blob holding the playlist entity. */
function embedPage(entity: object): string {
  const data = { props: { pageProps: { state: { data: { entity } } } } };
  return `<html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

const ENTITY = {
  type: "playlist",
  name: "Today's Top Hits",
  trackList: [
    { uri: "spotify:track:1", title: "Espresso", subtitle: "Sabrina Carpenter", duration: 175000 },
    { uri: "spotify:track:2", title: "APT.", subtitle: "ROSÉ, Bruno Mars", duration: 170000 },
    { uri: "spotify:track:2", title: "APT.", subtitle: "ROSÉ, Bruno Mars", duration: 170000 },
    { uri: "spotify:track:3", title: "", subtitle: "Nobody" },
  ],
};

describe("playlistIdFrom", () => {
  it.each([
    `https://open.spotify.com/playlist/${ID}`,
    `https://open.spotify.com/playlist/${ID}?si=abc123`,
    `https://open.spotify.com/intl-de/playlist/${ID}`,
    `spotify:playlist:${ID}`,
    `  ${ID}  `,
  ])("reads %s", (input) => {
    expect(playlistIdFrom(input)).toBe(ID);
  });

  it.each(["https://example.com/playlist/" + ID, "https://open.spotify.com/album/" + ID, "not a link", ""])(
    "rejects %s",
    (input) => {
      expect(playlistIdFrom(input)).toBeNull();
    },
  );
});

describe("parseEmbedPage", () => {
  it("reads the playlist name and songs, dropping duplicates and blanks", () => {
    const result = parseEmbedPage(embedPage(ENTITY));
    expect(result).toEqual({
      ok: true,
      name: "Today's Top Hits",
      songs: [
        { id: "spotify:track:1", title: "Espresso", artist: "Sabrina Carpenter", album: null },
        { id: "spotify:track:2", title: "APT.", artist: "ROSÉ, Bruno Mars", album: null },
      ],
    });
  });

  it("finds the track list even if Spotify moves it", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ a: { b: ENTITY } })}</script>`;
    expect(parseEmbedPage(html)).toMatchObject({ ok: true, name: "Today's Top Hits" });
  });

  it("says so plainly when the page can't be read", () => {
    expect(parseEmbedPage("<html>nothing here</html>")).toMatchObject({ ok: false });
    expect(parseEmbedPage(embedPage({ name: "Empty", trackList: [] }))).toEqual({
      ok: false,
      message: "That playlist has no songs we can use.",
    });
  });
});

describe("fetchPublicPlaylist", () => {
  it("fetches the embed page for the playlist", async () => {
    let asked = "";
    const fake = (async (url: string) => {
      asked = url;
      return new Response(embedPage(ENTITY));
    }) as unknown as typeof fetch;
    const result = await fetchPublicPlaylist(ID, fake);
    expect(asked).toBe(`https://open.spotify.com/embed/playlist/${ID}`);
    expect(result.ok && result.songs).toHaveLength(2);
  });

  it("explains a private or missing playlist", async () => {
    const fake = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await fetchPublicPlaylist(ID, fake)).toEqual({
      ok: false,
      message: "Spotify says that playlist doesn't exist or isn't public.",
    });
  });
});
