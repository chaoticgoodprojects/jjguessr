import { expect, test, type Page } from "@playwright/test";
import { dismissRules, joinAs, newPlayer } from "./helpers";

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

test("a game can be created from a plain http page, where browsers hide crypto.randomUUID", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  await host.goto("/");
  await host.getByRole("button", { name: "Create a game" }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z]{4}$/);
  await joinAs(host, "Ann", "Green");
  await expect(host.locator('[data-team="green"]').getByText("Ann")).toBeVisible();
});

test("the rules pop up once, and the ? button brings them back", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create a game" }).click();
  await expect(host.getByRole("dialog", { name: "How to play" })).toBeVisible();
  await expect(host.getByRole("dialog")).toContainText("After 2 minutes, the listener can reveal the artist or the album");
  await dismissRules(host);

  await host.reload();
  await expect(host.getByLabel("Your name")).toBeVisible();
  await expect(host.getByRole("dialog")).toHaveCount(0);

  await host.getByRole("button", { name: "Rules" }).click();
  await expect(host.getByRole("dialog", { name: "How to play" })).toBeVisible();
  await host.keyboard.press("Escape");
  await expect(host.getByRole("dialog")).toHaveCount(0);
});

test("a player whose browser forgot them gets their seat back", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create a game" }).click();
  await joinAs(host, "Ann", "Green");
  const link = host.url();
  const black = host.locator('[data-team="black"]');

  const bo = await newPlayer(browser);
  await bo.goto(link);
  await joinAs(bo, "Bo", "Black");
  await expect(black.getByRole("listitem")).toHaveCount(1);

  // Bo's browser loses everything; Bo taps their name to come back.
  await bo.context().close();
  await expect(black.getByText("Away")).toBeVisible();
  const boAgain = await newPlayer(browser);
  await boAgain.goto(link);
  await dismissRules(boAgain);
  await boAgain.getByRole("group", { name: "Rejoin" }).getByRole("button", { name: "Bo" }).click();
  await expect(boAgain.locator('[data-team="black"]').getByText("You")).toBeVisible();
  await expect(black.getByText("Away")).toHaveCount(0);

  // Typing the same name again works too, and still only one Bo.
  await boAgain.context().close();
  await expect(black.getByText("Away")).toBeVisible();
  const boThird = await newPlayer(browser);
  await boThird.goto(link);
  await joinAs(boThird, "bo", "Green");
  await expect(boThird.locator('[data-team="black"]').getByText("You")).toBeVisible();
  await expect(black.getByRole("listitem")).toHaveCount(1);
});

test("the host can swap and remove players", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create a game" }).click();
  await joinAs(host, "Ann", "Green");
  const bo = await newPlayer(browser);
  await bo.goto(host.url());
  await joinAs(bo, "Bo", "Black");

  // Only the host gets the buttons.
  await expect(bo.getByRole("button", { name: /^Move / })).toHaveCount(0);

  await host.getByRole("button", { name: "Move Bo to Green" }).click();
  await expect(bo.locator('[data-team="green"]').getByText("Bo")).toBeVisible();

  await host.getByRole("button", { name: "Remove Bo" }).click();
  await host.getByRole("button", { name: "Tap to remove" }).click();
  await expect(host.getByText("Bo")).toHaveCount(0);
  await expect(bo.getByRole("heading", { name: "Join this game" })).toBeVisible();
});
