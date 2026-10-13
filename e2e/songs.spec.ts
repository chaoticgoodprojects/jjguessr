import { expect, test } from "@playwright/test";
import { dismissRules, joinAs, newPlayer } from "./helpers";

test("the host picks a song pack and everyone sees it", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create a game" }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z]{4}$/);
  await joinAs(host, "Ann", "Green");
  await expect(host.getByTestId("song-source")).toContainText("All-time greats");

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Bo", "Black");
  await expect(guest.getByRole("radiogroup", { name: "Song packs" })).toHaveCount(0);

  await host.getByRole("radio", { name: "90s" }).click();
  await expect(host.getByRole("radio", { name: "90s" })).toHaveAttribute("aria-checked", "true");
  await expect(guest.getByText(/^90s · \d+ songs$/)).toBeVisible();
});

test("a link that isn't a Spotify playlist gets a clear message", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create a game" }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z]{4}$/);
  await dismissRules(host);
  await host.getByLabel("Or paste a public Spotify playlist link").fill("https://example.com/not-a-playlist");
  await host.getByRole("button", { name: "Use playlist" }).click();
  await expect(host.getByRole("alert")).toContainText("doesn't look like a Spotify playlist link");
  await expect(host.getByTestId("song-source")).toContainText("All-time greats");
});
