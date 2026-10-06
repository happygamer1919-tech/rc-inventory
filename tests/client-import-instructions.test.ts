import { test, expect } from "@playwright/test";
import { clientImportInstructions, CLIENT_IMPORT_FIELD_LABEL } from "../lib/data/client-import-types";

test("client import instructions mention both email and phone for dedup rule", () => {
  const instructions = clientImportInstructions();
  const allText = instructions.join(" ");

  const emailLabel = CLIENT_IMPORT_FIELD_LABEL.email;
  const phoneLabel = CLIENT_IMPORT_FIELD_LABEL.phone;
  const nameLabel = CLIENT_IMPORT_FIELD_LABEL.name;

  expect(allText).toContain(emailLabel);
  expect(allText).toContain(phoneLabel);
  expect(allText).toContain(nameLabel);

  // Verify the specific dedup rule text is present
  expect(allText).toMatch(
    new RegExp(`dublat după.*${emailLabel}.*${nameLabel}.*${phoneLabel}`, "i")
  );
});
