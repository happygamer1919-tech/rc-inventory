import { test, expect } from "@playwright/test";
import { readSlipNumber, SLIP_NUMBER_READ_FAILED } from "../lib/data/outbound-reference";

test("P3-340: a slip number that reads fine comes back as ok", async () => {
  const result = await readSlipNumber(async () => "IE-2026-0042");
  expect(result).toEqual({ ok: true, value: "IE-2026-0042" });
});

test("P3-340: a slip number that cannot be read comes back as the Romanian message, not a throw", async () => {
  const result = await readSlipNumber(async () => {
    throw new Error("Nu s-a putut afla numărul următoarei ieșiri: connection refused");
  });
  expect(result).toEqual({
    ok: false,
    message: "Numărul ieșirii nu a putut fi citit. Încearcă din nou.",
  });
  expect(SLIP_NUMBER_READ_FAILED).toBe("Numărul ieșirii nu a putut fi citit. Încearcă din nou.");
});

test("P3-340: the thrown text never reaches the operator", async () => {
  const result = await readSlipNumber(() => Promise.reject(new Error("secret internal detail")));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.message).not.toContain("secret");
});
