import { describe, expect, it } from "vitest";
import { isSelfTitled, normalizeTitle, titleMatches } from "./match";

describe("normalizeTitle", () => {
  it.each([
    ["Don't Stop Me Now - Remastered 2011", "dont stop me now"],
    ["Señorita (feat. Camila Cabello)", "senorita"],
    ["Mr. Brightside", "mr brightside"],
    ["The Middle", "middle"],
    ["Rock & Roll [Live]", "rock and roll"],
    ["Stay ft. Justin Bieber", "stay"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeTitle(raw)).toBe(expected);
  });
});

describe("titleMatches", () => {
  it("accepts guesses that differ only in case, punctuation or extras", () => {
    expect(titleMatches("dont stop me now", "Don't Stop Me Now - Remastered 2011")).toBe(true);
    expect(titleMatches("SENORITA", "Señorita (feat. Camila Cabello)")).toBe(true);
    expect(titleMatches("the middle", "The Middle")).toBe(true);
  });

  it("forgives a small typo in a longer title", () => {
    expect(titleMatches("mr brightsde", "Mr. Brightside")).toBe(true);
    expect(titleMatches("bohemian rapsody", "Bohemian Rhapsody")).toBe(true);
  });

  it("needs short titles exactly", () => {
    expect(titleMatches("hello", "Hello")).toBe(true);
    expect(titleMatches("hullo", "Hello")).toBe(false);
  });

  it("rejects partial or different titles", () => {
    expect(titleMatches("stop", "Don't Stop Me Now")).toBe(false);
    expect(titleMatches("dont stop believin", "Don't Stop Me Now")).toBe(false);
    expect(titleMatches("", "Hello")).toBe(false);
  });
});

describe("isSelfTitled", () => {
  it("spots albums named after the artist", () => {
    expect(isSelfTitled("Weezer", "Weezer (Blue Album)")).toBe(true);
    expect(isSelfTitled("Taylor Swift", "Taylor Swift")).toBe(true);
    expect(isSelfTitled("Queen", "Jazz")).toBe(false);
  });
});
