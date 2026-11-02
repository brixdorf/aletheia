import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "CF-IPCountry": "IN" } });

test("a visitor describes a task, audits the picked sites, compares, shares and deletes", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("before you pay");

  const prompt = page.getByLabel("What do you want to buy or subscribe to?");
  await prompt.fill("buy a 500 ml pack of toned milk");

  const picked = page.getByRole("list", { name: "Sites to audit" });
  await expect(picked).toContainText("blinkit.com");
  await expect(picked).toContainText("zepto.com");
  await expect(page.getByLabel("Country")).toHaveValue("IN");
  await expect(page.getByLabel("Flow")).toHaveValue("checkout");

  // Only Blinkit and Croma have saved runs here, so the visitor changes the picks.
  await page.getByRole("button", { name: "Remove zepto.com" }).click();
  await page.getByRole("button", { name: "Add a site" }).click();
  await page.getByLabel("Site address").fill("croma.com");
  await page.getByRole("button", { name: "Add site" }).click();
  await expect(picked).toContainText("croma.com");

  await page.getByRole("button", { name: "Run audit" }).click();
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

  await page.getByRole("link", { name: "Past audits" }).first().click();
  await expect(page).toHaveURL(/\/audits$/);
  const saved = page.getByRole("link", { name: "buy a 500 ml pack of toned milk" });
  await expect(saved).toBeVisible();

  await page.getByRole("button", { name: /^Delete:/ }).click();
  await page.getByRole("button", { name: "Delete audit" }).click();
  await expect(saved).toHaveCount(0);
});

test("the flow follows the words and can be changed, and old links still work", async ({
  page,
}) => {
  await page.goto("/new?task=Adobe%20Photoshop");
  await expect(page).toHaveURL(/\/\?task=Adobe%20Photoshop$/);

  await expect(page.getByRole("list", { name: "Sites to audit" })).toContainText("adobe.com");
  await expect(page.getByLabel("Flow")).toHaveValue("subscription");

  await page.getByLabel("Flow").selectOption("checkout");
  await expect(page.getByLabel("Flow")).toHaveValue("checkout");
});
