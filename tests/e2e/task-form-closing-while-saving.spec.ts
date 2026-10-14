import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// P3-276. Cat timp o salvare este in curs, formularul de sarcina nu se inchide
// (Escape, fundalul, X, Renunta), ca un refuz al serverului sa nu soseasca intr-un
// panou deja inchis. Salvarea se tine in aer cu un raspuns intarziat al actiunii de
// server, apoi se lasa sa treaca, iar panoul se inchide dupa ea.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

test.describe("Formularul de sarcina nu se inchide cat salveaza (P3-276)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("P3-276: Escape, fundalul, X si Renunta nu inchid panoul cat timp salvarea este in curs", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await page.goto("/sarcini");
    await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });

    // Actiunile de server sunt POST-uri cu antetul next-action; salvarea este tinuta
    // trei secunde inainte sa plece spre server.
    await page.route("**/sarcini", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      await route.continue();
    });

    await page.getByTestId("task-new").click();
    await expect(page.getByTestId("task-form")).toBeVisible();
    await page.getByTestId("field-task-title").fill(`TEST P3-276 salvare ${RUN}`);

    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("task-save")).toBeDisabled();

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Închide" }).click();
    await page.getByTestId("task-form-close").click();
    await page.mouse.click(10, 300);
    await expect(page.getByTestId("task-form")).toBeVisible();

    // Dupa raspuns, salvarea reusita inchide panoul ca pana acum.
    await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });
  });
});
