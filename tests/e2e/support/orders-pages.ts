import { expect, type Locator, type Page } from "@playwright/test";

/**
 * P3-142. Lista de iesiri de pe /comenzi are pagini de cate 50, cea mai noua intai. Un bon
 * semanat de pregatirea suitei este mai vechi decat tot ce scriu testele, deci nu mai sta
 * neaparat pe prima pagina. Aceasta functie deschide /comenzi si trece paginile cu "Înainte"
 * pana da de iesirea cu referinta data, apoi o intoarce.
 *
 * Dupa fiecare clic se asteapta ca eticheta paginii sa se schimbe, ca un rand citit din lista
 * veche sa nu fie luat drept raspunsul paginii noi.
 */
export async function showOutboundIssue(page: Page, reference: string): Promise<Locator> {
  await page.goto("/comenzi");
  const item = page.locator(`[data-testid="outbound-item"][data-reference="${reference}"]`);
  await expect(page.getByTestId("outbound-list")).toBeVisible({ timeout: 25_000 });

  for (let step = 0; step < 100; step += 1) {
    if ((await item.count()) > 0) return item;
    const next = page.getByTestId("pager-next");
    if ((await next.count()) === 0 || (await next.isDisabled())) break;
    const label = page.getByTestId("pager-label");
    const before = await label.innerText();
    await next.click();
    await expect(label).not.toHaveText(before, { timeout: 25_000 });
  }
  return item;
}
