import type { Song } from "../rules";

/**
 * A stand-in song list so games can start before song sources exist
 * (milestone 4 replaces this with the built-in packs and Spotify links).
 */
export const SAMPLE_SONGS: Song[] = [
  ["Bohemian Rhapsody", "Queen", "A Night at the Opera"],
  ["Billie Jean", "Michael Jackson", "Thriller"],
  ["Like a Rolling Stone", "Bob Dylan", "Highway 61 Revisited"],
  ["Smells Like Teen Spirit", "Nirvana", "Nevermind"],
  ["Hotel California", "Eagles", "Hotel California"],
  ["Sweet Child O' Mine", "Guns N' Roses", "Appetite for Destruction"],
  ["Dancing Queen", "ABBA", "Arrival"],
  ["Wonderwall", "Oasis", "(What's the Story) Morning Glory?"],
  ["Rolling in the Deep", "Adele", "21"],
  ["Mr. Brightside", "The Killers", "Hot Fuss"],
  ["Uptown Funk (feat. Bruno Mars)", "Mark Ronson", "Uptown Special"],
  ["Hey Ya!", "OutKast", "Speakerboxxx/The Love Below"],
  ["Crazy in Love (feat. Jay-Z)", "Beyoncé", "Dangerously in Love"],
  ["Shake It Off", "Taylor Swift", "1989"],
  ["Blinding Lights", "The Weeknd", "After Hours"],
  ["Bad Guy", "Billie Eilish", "When We All Fall Asleep, Where Do We Go?"],
  ["Livin' on a Prayer", "Bon Jovi", "Slippery When Wet"],
  ["Don't Stop Believin'", "Journey", "Escape"],
  ["Africa", "Toto", "Toto IV"],
  ["Superstition", "Stevie Wonder", "Talking Book"],
  ["Respect", "Aretha Franklin", "I Never Loved a Man the Way I Love You"],
  ["Wannabe", "Spice Girls", "Spice"],
  ["Seven Nation Army", "The White Stripes", "Elephant"],
  ["Levitating", "Dua Lipa", "Future Nostalgia"],
  ["Since U Been Gone", "Kelly Clarkson", "Breakaway"],
  ["Single Ladies (Put a Ring on It)", "Beyoncé", "I Am... Sasha Fierce"],
].map(([title, artist, album], i) => ({ id: `sample-${i + 1}`, title: title!, artist: artist!, album: album! }));
