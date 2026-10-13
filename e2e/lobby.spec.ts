import { expect, test, type Page } from "@playwright/test";
import { joinAs, newPlayer } from "./helpers";

test("four players join from a link, pick teams, and the host starts the game", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create a game" }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z]{4}$/);
  const link = host.url();
  await joinAs(host, "Ann", "Green");

  const start = host.getByRole("button", { name: "Start the game" });
  await expect(start).toBeDisabled();
  await expect(host.getByText("Each team needs at least 2 players.")).toBeVisible();

  const others = await Promise.all([newPlayer(browser), newPlayer(browser), newPlayer(browser)]);
  const [bo, cy, di] = others as [Page, Page, Page];
  for (const [page, name, team] of [[bo, "Bo", "Black"], [cy, "Cy", "Green"], [di, "Di", "Green"]] as const) {
    await page.goto(link);
    await joinAs(page, name, team);
  }

  // Di changes their mind.
  await di.getByRole("button", { name: "Switch to Black" }).click();

  const black = host.locator('[data-team="black"]');
  await expect(black.getByText("Bo")).toBeVisible();
  await expect(black.getByText("Di")).toBeVisible();
  await expect(bo.getByText("Waiting for Ann to start the game.")).toBeVisible();

  await expect(start).toBeEnabled();
  await start.click();

  await expect(host.getByText("Pick your song")).toBeVisible();
  for (const page of others) {
    await expect(page.getByText("Round 1 of 10")).toBeVisible();
    await expect(page.getByText("Ann is picking a song.")).toBeVisible();
  }
});

test("a player who reloads keeps their seat", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create a game" }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z]{4}$/);
  await joinAs(host, "Ann", "Green");
  await expect(host.locator('[data-team="green"]').getByText("Ann")).toBeVisible();

  await host.reload();
  await expect(host.locator('[data-team="green"]').getByText("You")).toBeVisible();
  await expect(host.getByRole("button", { name: "Start the game" })).toBeVisible();
});

test("a wrong code says the game doesn't exist", async ({ page }) => {
  await page.goto("/r/ZZZZ");
  await expect(page.getByText("No game with that code")).toBeVisible();
});
