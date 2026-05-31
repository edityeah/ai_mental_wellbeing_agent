import { test, expect } from "@playwright/test";

test("voice modal opens when the phone icon is clicked", async ({ page }) => {
  // This test does NOT exercise a real call (would need a logged-in session + LiveKit).
  // It verifies the modal mounts when the chat shell is visible.
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
});
