import { expect, test } from "@playwright/test";
test.use({ colorScheme: "dark" });
test("dark mode shots", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@test.local");
  await page.getByLabel("Password").fill("test1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "tests/e2e/screenshots/50-dark-dashboard.png" });
  await page.goto("/quotations/?tab=reports");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "tests/e2e/screenshots/51-dark-report.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "tests/e2e/screenshots/52-phone-dashboard.png" });
});
