# jjguessr

A two-team song guessing game to play with family and friends over a group call or in person.

## How it plays

- Two teams, green and black. Players join from a game link, put a name down and pick a team.
- 10 rounds. Each round, each team gets one turn with a song drawn from the game's playlist.
- One player per team per round is the listener (picked automatically, rotating in join order). They choose the song from 5 offered at random from the playlist. Only they see it, and they type hints for their teammates.
- A turn lasts 3 minutes and starts at 100 points. The team banks whatever is left when they guess the title.

| What happens | Points |
| --- | --- |
| Every 6 seconds | −1 |
| Wrong guess | −20 |
| Hints 1 to 3 | free |
| Each hint after the 3rd | −50 |
| Reveal the artist or the album (once, never both; not on self-titled albums) | −50 |

The turn ends on a correct guess, at 3:00, or when the points reach 0.

No singing, humming, playing or reciting the song, no naming the artist or album, and no telling the listener what hints to give.

## Code

- `src/rules/` holds the game rules: scoring, the turn clock, hints, reveals, guesses, listener rotation and the song pool. It is pure TypeScript with no network code, so the game server and the tests share it.

```sh
npm install
npm test
npm run typecheck
```
