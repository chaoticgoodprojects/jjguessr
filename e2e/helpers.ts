import { expect, type Browser, type Page } from "@playwright/test";

/** Each player gets their own browser context, like separate phones. */
export async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

export async function joinAs(page: Page, name: string, team: "Green" | "Black") {
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("radio", { name: team }).click();
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

/** Ann hosts on green with Cy; Bo and Di play black. Returns once round 1 has started. */
export async function startFourPlayerGame(browser: Browser) {
  const ann = await newPlayer(browser);
  await ann.goto("/");
  await ann.getByRole("button", { name: "Create a game" }).click();
  await expect(ann).toHaveURL(/\/r\/[A-Z]{4}$/);
  await joinAs(ann, "Ann", "Green");
  const link = ann.url();

  const [bo, cy, di] = (await Promise.all([newPlayer(browser), newPlayer(browser), newPlayer(browser)])) as [Page, Page, Page];
  for (const [page, name, team] of [[bo, "Bo", "Black"], [cy, "Cy", "Green"], [di, "Di", "Black"]] as const) {
    await page.goto(link);
    await joinAs(page, name, team);
  }
  await ann.getByRole("button", { name: "Start the game" }).click();
  for (const page of [ann, bo, cy, di]) await expect(page.getByText("Round 1 of 10")).toBeVisible();
  return { ann, bo, cy, di, link };
}

/** The listener picks the first song offered, starts the clock, and returns the song's title. */
export async function pickAndStart(listener: Page): Promise<string> {
  await listener.getByRole("radio").first().click();
  await expect(listener.getByRole("button", { name: "Start the clock" })).toBeEnabled();
  await listener.getByRole("button", { name: "Start the clock" }).click();
  const card = listener.getByRole("region", { name: "Your song" });
  await expect(card).toBeVisible();
  return (await card.locator(".song-title").innerText()).trim();
}
