import { expect, test } from "@playwright/test";

test("a visitor audits two sites, compares them, shares the report and deletes it", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "New audit" }).click();

  await page.getByLabel("What should the agent try to do?").fill("Buy one cheap everyday item");
  await page.getByRole("radio", { name: /Buying something/ }).check();
  await page.getByRole("button", { name: "blinkit.com" }).click();
  await page.getByRole("button", { name: "croma.com" }).click();
  await page.getByRole("button", { name: "Start audit" }).click();

  await expect(page).toHaveURL(/\/audits\//);

  const comparison = page.getByRole("table").filter({ hasText: "Hidden cost" });
  await expect(comparison).toBeVisible({ timeout: 30_000 });
  const hiddenCost = comparison.getByRole("row", { name: /Hidden cost/ });
  await expect(hiddenCost).toContainText("+Rs 57, +238% so far");
  await expect(hiddenCost).toContainText("+Rs 0 so far");

  // A milk packet and earphones are different items, so neither can be the cheaper one.
  await expect(comparison.getByRole("row", { name: /^Item/ })).toContainText("Nandini");
  await expect(comparison).not.toContainText("Lowest total");
  await expect(page.getByText(/different items, so there is no winner/)).toBeVisible();

  await page.getByRole("button", { name: "Share read-only link" }).click();
  const link = await page.getByRole("textbox", { name: /link/i }).inputValue();

  const stranger = await browser.newContext();
  const sharedPage = await stranger.newPage();
  await sharedPage.goto(link);
  await expect(sharedPage.getByRole("heading", { name: "Side by side" })).toBeVisible();
  await expect(sharedPage.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await stranger.close();

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete audit" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Buy one cheap everyday item")).toHaveCount(0);
});
