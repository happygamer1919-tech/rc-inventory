import { expect, type Page } from "@playwright/test";
import type { TestAccount } from "./accounts";

export const LOGIN_PATH = "/autentificare";

/** Completeaza si trimite formularul de autentificare. Nu asteapta rezultatul. */
export async function submitLogin(page: Page, account: TestAccount): Promise<void> {
  await page.goto(LOGIN_PATH);
  await expect(page.getByTestId("login-form")).toBeVisible();
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByTestId("login-submit").click();
}

/** Autentificare completa, cu asteptarea aterizarii pe tabloul de bord. */
export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await submitLogin(page, account);
  await page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 30_000 });
  await expect(page.getByTestId("topbar-role")).toBeVisible();
}

/** Iesire din cont, ca urmatorul test sa porneasca de la zero. */
export async function signOut(page: Page): Promise<void> {
  await page.getByTestId("sign-out").click();
  await page.waitForURL((url) => new URL(url).pathname === LOGIN_PATH, { timeout: 30_000 });
}
