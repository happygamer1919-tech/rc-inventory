import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// P3-273: a Sarcini link with a malformed colleague id (`abc`, a cut-off old link) shows
// the task list unfiltered, not the error screen.

for (const bad of ["abc", "550e8400-e29b-41d4-a716"]) {
  test(`sarcini: responsabil=${bad} arata lista, nu ecranul de eroare`, async ({ page }) => {
    test.setTimeout(90_000);

    await signIn(page, ownerAccount());
    await page.goto(`/sarcini?responsabil=${bad}`);

    await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Sarcini" }).first()).toBeVisible();
    await expect(page.getByTestId("tasks-assignee")).toHaveValue("");

    // The malformed value is dropped from the address by the screen's cleanup.
    await page.waitForURL((url) => !url.searchParams.has("responsabil"), { timeout: 15_000 });
  });
}
