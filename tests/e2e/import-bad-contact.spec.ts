// Importul de clienti si leaduri: o celula de telefon sau email completata, dar
// ilizibila, este eroare pe rand, cu motiv. Nu atinge nici browserul, nici baza.
import { expect, test } from "@playwright/test";
import {
  IMPORT_REASON,
  normalisePhone,
  prepareRow,
  type ColumnMapping,
} from "@/lib/data/lead-import-types";
import { buildClientImportPreview, CLIENT_IMPORT_REASON } from "@/lib/data/client-import-types";
import { normalisePhone as normaliseClientPhone } from "@/lib/data/client-import-types";

const ACCEPTED = [
  "069123456",
  "0 69 12 34 56",
  "+373 69 123 456",
  "00373691234 56",
  "37369123456",
  "69123456",
];
const REFUSED = ["069123456, 079654321", "069123456; 079654321", "069123456 / 079654321", "069123456 079654321", "069 123 45", "abc", "+069123456"];

test("telefon de import: formele acceptate dau +37369123456, cele ilizibile sunt refuzate", () => {
  for (const phone of [normalisePhone, normaliseClientPhone]) {
    for (const input of ACCEPTED) expect(phone(input), input).toBe("+37369123456");
    for (const input of REFUSED) expect(phone(input), input).toBeNull();
    expect(phone("+44 20 7946 0958")).toBe("+442079460958");
  }
});

const LEAD_MAPPING: ColumnMapping = ["name", "phone", "email"];

function lead(phone: string, email: string) {
  return prepareRow(["TEST Rand", phone, email], LEAD_MAPPING, 2, new Map(), "");
}

test("import leaduri: email sau telefon scris gresit este eroare pe rand, cu motiv", () => {
  const badEmail = lead("069123456", "ion@gmail");
  expect(badEmail.ok).toBe(false);
  if (!badEmail.ok) expect(badEmail.reason).toBe(IMPORT_REASON.badEmail);

  const manyEmails = lead("069123456", "a@x.md; b@x.md");
  expect(manyEmails.ok).toBe(false);
  if (!manyEmails.ok) expect(manyEmails.reason).toBe(IMPORT_REASON.manyEmails);

  const manyPhones = lead("069123456, 079654321", "a@x.md");
  expect(manyPhones.ok).toBe(false);
  if (!manyPhones.ok) expect(manyPhones.reason).toBe(IMPORT_REASON.manyPhones);

  const badPhone = lead("069 123 45", "a@x.md");
  expect(badPhone.ok).toBe(false);
  if (!badPhone.ok) expect(badPhone.reason).toBe(IMPORT_REASON.badPhone);
});

test("import leaduri: email gol cu telefon bun si invers raman acceptate, fara niciunul se refuza", () => {
  const phoneOnly = lead("069123456", "");
  expect(phoneOnly.ok).toBe(true);
  if (phoneOnly.ok) expect(phoneOnly.lead.phone).toBe("+37369123456");

  const emailOnly = lead("", "Ion@Exemplu.md");
  expect(emailOnly.ok).toBe(true);
  if (emailOnly.ok) expect(emailOnly.lead.email).toBe("ion@exemplu.md");

  const none = lead("", "");
  expect(none.ok).toBe(false);
  if (!none.ok) expect(none.reason).toBe(IMPORT_REASON.noContact);
});

test("import clienti: email sau telefon scris gresit este eroare pe rand, cel gol ramane acceptat", () => {
  const mapping: (("name" | "phone" | "email") | null)[] = ["name", "phone", "email"];
  const preview = buildClientImportPreview(
    [
      ["TEST A", "069123456", "ion@gmail"],
      ["TEST B", "069123456", "a@x.md; b@x.md"],
      ["TEST C", "069123456, 079654321", ""],
      ["TEST D", "069 123 45", ""],
      ["TEST E", "069123456", ""],
      ["TEST F", "", "ion@exemplu.md"],
    ],
    mapping,
    new Map(),
  );
  expect(preview.invalid.map((row) => row.reason)).toEqual([
    CLIENT_IMPORT_REASON.badEmail,
    CLIENT_IMPORT_REASON.manyEmails,
    CLIENT_IMPORT_REASON.manyPhones,
    CLIENT_IMPORT_REASON.badPhone,
  ]);
  expect(preview.valid.map((row) => row.record.name)).toEqual(["TEST E", "TEST F"]);
  expect(preview.valid[0]?.record.phone).toBe("+37369123456");
});
