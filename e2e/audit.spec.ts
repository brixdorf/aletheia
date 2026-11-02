import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "CF-IPCountry": "IN" } });

const TASK = "subscribe to a music streaming plan";

test("a visitor describes a task, audits the picked sites, compares, shares and deletes", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("dark patterns");
  await expect(page.getByText("Country")).toHaveCount(0);

  const prompt = page.getByLabel("What should Aletheia audit?");
  await prompt.fill(TASK);

  const picked = page.getByRole("list", { name: "Sites to audit" });
  await expect(picked).toContainText("spotify.com");
  await expect(picked).toContainText("netflix.com");
  await expect(picked).toContainText("adobe.com");

  // Only Adobe and LinkedIn have saved runs here, so the visitor changes the picks.
  await page.getByRole("button", { name: "Remove netflix.com" }).click();
  await page.getByRole("button", { name: "Remove spotify.com" }).click();
  await page.getByRole("button", { name: "Add a site" }).click();
  await page.getByLabel("Site address").fill("linkedin.com");
  await page.getByRole("button", { name: "Add site" }).click();
  await expect(picked).toContainText("linkedin.com");

  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page).toHaveURL(/\/audits\//);

  const comparison = page.getByRole("table").filter({ hasText: "Patterns found" });
  await expect(comparison).toBeVisible({ timeout: 30_000 });
  await expect(comparison.getByRole("row", { name: /Patterns found/ })).toContainText(
    "Subscription trap",
  );

  // Neither run saw a price move, so prices stay out of the comparison and off the page.
  await expect(comparison).not.toContainText("Price change");
  await expect(comparison).not.toContainText("Lowest total");
  await expect(page.getByText(/different items, so compare the patterns/)).toBeVisible();

  await expect(page.getByText(/^Audited as a subscription sign-up on adobe\.com/)).toContainText(
    "from India",
  );
  const findings = page.getByRole("list", { name: "Findings on adobe.com" });
  await expect(findings.getByRole("listitem").first()).toContainText("found");

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
  const saved = page.getByRole("link", { name: TASK });
  await expect(saved).toBeVisible();
  await expect(page.getByText("Subscription trap").first()).toBeVisible();

  await page.getByRole("button", { name: /^Delete:/ }).click();
  await page.getByRole("button", { name: "Delete audit" }).click();
  await expect(saved).toHaveCount(0);
});

test("the flow follows the words and stays off the home page, and old links still work", async ({
  page,
}) => {
  await page.goto("/new?task=Adobe%20Photoshop");
  await expect(page).toHaveURL(/\/\?task=Adobe%20Photoshop$/);

  await expect(page.getByRole("list", { name: "Sites to audit" })).toContainText("adobe.com");
  await expect(page.getByLabel("Flow")).toHaveCount(0);
  await expect(page.getByLabel("Country")).toHaveCount(0);
});
