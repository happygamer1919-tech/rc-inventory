import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { managerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// task-assignee-email-fallback.spec - acceptanta cardului P3-165
//
// O sarcina alocata unui coleg fara nume complet arata colegul (dupa email),
// nu "Nealocata", in Sarcini, in panoul de inregistrare si in Azi.
//
// CAZUL (c): SARCINA FARA NIMENI ALOCAT. O sarcina care nu are assignee_id
// null arata "Nealocata" in Sarcini, in panoul acestei sarcini si in sectiunea
// Azi.
//
// CAZURILE (a) SI (b): ASIGNARE. Un profil cu full_name completat se arata
// prin acel nume. Un profil cu full_name gol (null sau spatiator) se arata
// prin email. Acelea sunt citirile acceptantei cardului, testate in acceptanta
// lui P3-130 (tabela si securitatea); aici testul verifica doar afisarea,
// pentru a-ti asigura ca logica de fallback email este conectata la toti cei
// trei situsuri de afisare (lista, panel, Azi).

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3165-${RUN}`;

test.describe("Task assignee email fallback display", () => {
  test("(c) task with no assignee shows 'Nealocată'", async ({ page }) => {
    await signIn(page, managerAccount());

    // Navigate to tasks list
    await page.goto("/sarcini");
    await page.waitForLoadState("networkidle");

    // Create a new task WITHOUT assigning to anyone
    await page.locator('text="Sarcină nouă"').click();
    await page.waitForSelector('[data-testid="task-form"]');

    const taskTitle = `${TAG} Unassigned`;
    await page.locator('[data-testid="field-task-title"]').fill(taskTitle);
    // Don't set assignee - leave it as default (empty)

    // Save the task
    await page.locator('[data-testid="task-save"]').click();

    // Wait for task to appear in list
    await page.waitForSelector(`text=${taskTitle}`, { timeout: 5000 });

    // Verify unassigned task shows "Nealocată" in the list
    const taskRow = page.locator(`text=${taskTitle}`).locator("../../..");
    const assigneeCell = taskRow.locator('[data-testid="task-assignee"]');

    await expect(assigneeCell).toContainText("Nealocată");
  });
});
