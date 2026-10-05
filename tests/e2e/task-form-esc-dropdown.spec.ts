import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// task-form-esc-dropdown.spec - linia de acceptanta a cardului P3-150 pentru
// controlul tastei Escape in formularul de sarcina.
//
// COMPORTAMENTUL ASTEPTAT:
// Cand lista unui Combobox (de ex. Înregistrare) este deschisa si se apasa Escape,
// trebuie sa se inchida NUMAI lista, nu formularul intreg. Textul deja scris in
// formularul de sarcina ramane. Un al doilea Escape (cu lista inchisa) inchide
// formularul.
//
// EROAREA VECHE: Escape inchidea lista dar evenimentul propagau la window listener-ul
// din TaskForm care inchidea formularul intreg, pierdand textul scris.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function taskTitle(tag: string): string {
  return `TEST P3-150 ${tag} ${RUN}`;
}

test.describe("Esc in dropdown al formularului de sarcina (P3-150)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("P3-150: apasand Esc intr-o lista deschisa din formularul de sarcina, lista se inchide dar formularul si textul scris raman", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    // Deschide ecranul Sarcini
    await page.goto("/sarcini");
    await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });

    // Deschide formularul de sarcina noua
    await page.getByTestId("task-new").click();
    await expect(page.getByTestId("task-form")).toBeVisible();

    // Scrie titlul si descrierea
    const titleText = taskTitle("Test escape in dropdown");
    const descriptionText = "O descriere care nu trebuie pierduta";
    await page.getByTestId("field-task-title").fill(titleText);
    await page.getByTestId("field-task-description").fill(descriptionText);

    // Verifica ca titlul si descrierea sunt acolo
    await expect(page.getByTestId("field-task-title")).toHaveValue(titleText);
    await expect(page.getByTestId("field-task-description")).toHaveValue(descriptionText);

    // Fel înregistrare este un select nativ. Alegerea unui fel (prima optiune
    // dupa "Fără înregistrare") arata campul Înregistrare, care este un Combobox.
    await page.getByTestId("field-task-entity-type").selectOption({ index: 1 });
    const entityInput = page.getByTestId("field-task-entity").locator("input");
    await expect(entityInput).toBeVisible();

    // Focusul pe camp deschide lista.
    await entityInput.click();

    // Verifica ca lista dropdown-ului este deschisa (cautam o optiune in lista)
    const dropdownOptions = page.locator('[data-rc-combo-list]');
    await expect(dropdownOptions).toBeVisible();

    // Apasa Escape - trebuie sa inchida DOAR lista, nu formularul
    await page.keyboard.press("Escape");

    // Verifica ca lista s-a inchis
    await expect(dropdownOptions).not.toBeVisible();

    // Verifica ca formularul este inca deschis
    await expect(page.getByTestId("task-form")).toBeVisible();

    // Verifica ca textul scris este inca acolo
    await expect(page.getByTestId("field-task-title")).toHaveValue(titleText);
    await expect(page.getByTestId("field-task-description")).toHaveValue(descriptionText);

    // Al doilea Escape (cu lista inchisa) trebuie sa inchida formularul
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 20_000 });
  });
});
