import { test, expect } from "@playwright/test";

test.describe("smoke: login redirect + chat shell", () => {
  test("anonymous user is redirected to /login", async ({ page }) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
  });

  test("login form requires an email", async ({ page }) => {
    await page.goto("/login");
    const btn = page.getByRole("button", { name: /send magic link/i });
    await btn.click();
    // The native form validation should block submission.
    await expect(page).toHaveURL(/\/login$/);
  });
});
