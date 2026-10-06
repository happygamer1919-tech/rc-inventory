import { expect, test } from "@playwright/test";
import { isDayString } from "@/lib/data/tasks-shape";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// P3-169. Trei defecte mici pe ecranele Sarcini: o data imposibila in adresa, un
// buton Anulează sarcina mut cand data este rosie, si o navigare la fiecare tasta
// in filtrele de data.

const SARCINI = "/sarcini";

test("sarcini mici: isDayString cere o zi reala din calendar", () => {
  expect(isDayString("2026-02-31")).toBe(false);
  expect(isDayString("2026-02-28")).toBe(true);
  expect(isDayString("2028-02-29")).toBe(true);
  expect(isDayString("2027-02-29")).toBe(false);
  expect(isDayString("2026-13-01")).toBe(false);
  expect(isDayString("2026-00-10")).toBe(false);
  expect(isDayString("26-02-10")).toBe(false);
  expect(isDayString("")).toBe(false);
});

test("sarcini mici: o data imposibila in adresa inseamna fara filtru, fara pagina de eroare", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, ownerAccount());

  await page.goto(`${SARCINI}?de_la=2026-02-31`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tasks-due-from")).toHaveValue("");

  await page.goto(`${SARCINI}?pana_la=2026-02-31`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tasks-due-to")).toHaveValue("");
});

test("sarcini mici: cu data rosie, Anulează sarcina nu ramane un clic mut", async ({ page }) => {
  test.setTimeout(180_000);
  const title = `P3-169 data rosie ${Date.now()}`;

  await signIn(page, ownerAccount());
  await page.goto(`${SARCINI}?de_la=2036-06-01&pana_la=2036-06-30`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("task-new").click();
  await page.getByTestId("field-task-title").fill(title);
  await page.getByTestId("field-task-due-date").fill("15.06.2036");
  await page.getByTestId("task-save").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });

  const row = page
    .getByTestId("task-row")
    .filter({ has: page.getByTestId("task-title").getByText(title, { exact: true }) });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await row.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();

  // Cu o data valida, anularea este oferita.
  await expect(page.getByTestId("task-cancel-task")).toBeEnabled();

  // O data imposibila, scrisa intreaga, face casuta rosie.
  await page.getByTestId("field-task-due-date").fill("31.02.2036");
  await expect(page.getByTestId("field-task-due-date-error")).toBeVisible();
  await expect(page.getByTestId("task-save")).toBeDisabled();
  await expect(page.getByTestId("task-cancel-task")).toBeDisabled();

  // Data corectata scoate rosul, iar anularea revine. Si sarcina se anuleaza la
  // sfarsit, ca sa nu ramana deschisa pe lista pentru celelalte cazuri.
  await page.getByTestId("field-task-due-date").fill("15.06.2036");
  await expect(page.getByTestId("task-cancel-task")).toBeEnabled();
  await page.getByTestId("task-cancel-task").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });
  await expect(row.getByTestId("task-status")).toHaveText("Anulată", { timeout: 30_000 });
});

test("sarcini mici: scrisa in filtru, o data produce cel mult o navigare, dupa ce este intreaga", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, ownerAccount());
  await page.goto(SARCINI);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });

  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && frame.url().includes("/sarcini")) navigations += 1;
  });

  const box = page.getByTestId("tasks-due-from");
  await box.click();
  // Tasta cu tasta: zece taste, o singura data intreaga.
  await box.pressSequentially("10.03.2033", { delay: 60 });
  await page.waitForURL(/de_la=2033-03-10/, { timeout: 30_000 });
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  // Lasam timp unei eventuale navigari intarziate sa apara.
  await page.waitForTimeout(1_500);
  expect(navigations, "o singura navigare pentru o data scrisa tasta cu tasta").toBeLessThanOrEqual(1);

  // Casuta golita scoate filtrul.
  await box.fill("");
  await expect.poll(() => new URL(page.url()).searchParams.has("de_la"), {
    timeout: 30_000,
  }).toBe(false);
});
