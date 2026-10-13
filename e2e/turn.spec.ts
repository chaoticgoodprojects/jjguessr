import { expect, test } from "@playwright/test";
import { pickAndStart, startFourPlayerGame } from "./helpers";

test("a turn: the listener hints, a teammate guesses, everyone sees the score", async ({ browser }) => {
  const { ann, bo, cy, di } = await startFourPlayerGame(browser);

  // Only Ann sees the songs to pick from.
  await expect(cy.getByRole("radio")).toHaveCount(0);
  const title = await pickAndStart(ann);
  for (const page of [bo, cy, di]) await expect(page.getByText(title)).toHaveCount(0);

  await ann.getByLabel("Your hint").fill("a big singalong");
  await ann.getByRole("button", { name: "Send hint" }).click();
  for (const page of [bo, cy, di]) await expect(page.getByText("a big singalong")).toBeVisible();

  // Black is watching, so Bo has nowhere to guess.
  await expect(bo.getByLabel("Song title")).toHaveCount(0);

  await cy.getByLabel("Song title").fill("definitely not it");
  await cy.getByRole("button", { name: "Guess" }).click();
  await expect(ann.getByText("Cy: definitely not it")).toBeVisible();
  await expect(cy.getByTestId("points")).toHaveText(/^[5-8]\d$/);

  await cy.getByLabel("Song title").fill(title);
  await cy.getByRole("button", { name: "Guess" }).click();

  for (const page of [ann, bo, cy, di]) {
    await expect(page.getByRole("heading", { name: /Got it! \+\d+/ })).toBeVisible();
    await expect(page.getByText(`The song was ${title}`, { exact: false })).toBeVisible();
  }
  const banked = Number((await ann.getByTestId("score-green").innerText()).trim());
  expect(banked).toBeGreaterThan(60);
  expect(banked).toBeLessThanOrEqual(80);

  await di.getByRole("button", { name: "Next turn" }).click();
  await expect(bo.getByText("Pick your song")).toBeVisible();
  await expect(ann.getByText("Bo is picking a song.")).toBeVisible();
});

test("the listener can count a guess the app rejected", async ({ browser }) => {
  const { ann, cy } = await startFourPlayerGame(browser);
  await pickAndStart(ann);
  await cy.getByLabel("Song title").fill("close enough");
  await cy.getByRole("button", { name: "Guess" }).click();
  await ann.getByRole("button", { name: "Count it" }).click();
  await expect(cy.getByRole("heading", { name: /Got it! \+\d+/ })).toBeVisible();
});

test("reveals and extra hints ask for a second tap", async ({ browser }) => {
  const { ann, cy } = await startFourPlayerGame(browser);
  await pickAndStart(ann);

  const reveal = ann.getByRole("button", { name: "Reveal artist" });
  await reveal.click();
  await expect(ann.getByRole("button", { name: "Tap again: −50" }).first()).toBeVisible();
  await ann.getByRole("button", { name: "Tap again: −50" }).first().click();
  await expect(cy.getByText("artist", { exact: true })).toBeVisible();
  await expect(ann.getByText("Already revealed this turn.")).toBeVisible();
  await expect(cy.getByTestId("points")).toHaveText(/^[45]\d$/);

  for (const hint of ["one", "two", "three"]) {
    await ann.getByLabel("Your hint").fill(hint);
    await ann.getByRole("button", { name: "Send hint" }).click();
    await expect(cy.getByText(hint, { exact: true })).toBeVisible();
  }
  await ann.getByLabel("Your hint").fill("four");
  await ann.getByRole("button", { name: "Send hint" }).click();
  await expect(cy.getByText("four", { exact: true })).toHaveCount(0);
  await ann.getByRole("button", { name: "Send for −50" }).click();
  // 100 − 50 reveal − 50 hint leaves nothing, so the turn ends.
  await expect(cy.getByRole("heading", { name: "Out of points" })).toBeVisible();
});

test("ten rounds end on the final scores", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ann, bo, cy, di } = await startFourPlayerGame(browser);
  const listeners = { Ann: ann, Bo: bo, Cy: cy, Di: di };
  for (let turn = 0; turn < 20; turn++) {
    const picking = await ann.locator("text=/^(\\w+) is picking a song\\.$|^Pick your song$/").first().innerText();
    const listener = picking === "Pick your song" ? ann : listeners[picking.split(" ")[0] as keyof typeof listeners];
    await pickAndStart(listener);
    await ann.getByRole("button", { name: "Void this turn for a rule break" }).click();
    await ann.getByRole("button", { name: "Tap again to void (0 points)" }).click();
    await expect(ann.getByRole("heading", { name: "Turn voided" })).toBeVisible();
    await ann.getByRole("button", { name: turn === 19 ? "See final scores" : "Next turn" }).click();
  }
  for (const page of [ann, bo, cy, di]) await expect(page.getByRole("heading", { name: "It's a tie at 0" })).toBeVisible();
  await expect(cy.getByRole("region", { name: "Every turn" }).getByRole("listitem")).toHaveCount(20);
});
