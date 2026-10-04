// P3-138. Codarea fisierelor CSV si linia de aparare de pe server. Specificatii
// pure: nu ating nici browserul, nici baza.
import { expect, test } from "@playwright/test";
import {
  BROKEN_LETTERS_FILE_ERROR,
  BROKEN_LETTERS_ROW_REASON,
  decodeCsvFile,
  prepareImportRow,
  type ImportFieldDescriptor,
} from "@/lib/data/import-shared";

function buffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

function ascii(text: string): number[] {
  return [...text].map((ch) => ch.charCodeAt(0));
}

test("codare csv: UTF-8 cu si fara BOM se citeste neschimbat", () => {
  const utf8 = [...new TextEncoder().encode("Nume\nȘtefan Țurcanu, Bălți")];
  const plain = decodeCsvFile(buffer(utf8));
  expect(plain).toEqual({ text: "Nume\nȘtefan Țurcanu, Bălți", encoding: "utf-8" });
  const withBom = decodeCsvFile(buffer([0xef, 0xbb, 0xbf, ...utf8]));
  expect(withBom).toEqual({ text: "Nume\nȘtefan Țurcanu, Bălți", encoding: "utf-8" });
});

test("codare csv: windows-1250 cu Ștefan Țurcanu, Bălți se citeste corect", () => {
  // Excel pe Windows romanesc scrie Ş (0xAA), Ţ (0xDE), ă (0xE3), ţ (0xFE) cu sedila.
  const bytes = [
    0xaa, ...ascii("tefan "), 0xde, ...ascii("urcanu, B"), 0xe3, ...ascii("l"), 0xfe, ...ascii("i"),
  ];
  const result = decodeCsvFile(buffer(bytes));
  expect(result).toEqual({ text: "Ștefan Țurcanu, Bălți", encoding: "windows-1250" });
});

test("codare csv: windows-1251 cu Иван Петров se citeste corect", () => {
  const bytes = [
    0xc8, 0xe2, 0xe0, 0xed, 0x20, 0xcf, 0xe5, 0xf2, 0xf0, 0xee, 0xe2,
  ];
  const result = decodeCsvFile(buffer(bytes));
  expect(result).toEqual({ text: "Иван Петров", encoding: "windows-1251" });
});

test("codare csv: un fisier cu litere deja stricate este refuzat cu mesajul romanesc", () => {
  // U+FFFD salvat deja ca UTF-8 (EF BF BD): un fisier stricat la o salvare anterioara.
  const bytes = [...ascii("Nume\n"), ...ascii("tefan "), 0xef, 0xbf, 0xbd];
  const result = decodeCsvFile(buffer(bytes));
  expect(result).toEqual({ error: BROKEN_LETTERS_FILE_ERROR });
  expect(BROKEN_LETTERS_FILE_ERROR).toContain("CSV UTF-8");
});

test("import server: un camp cu U+FFFD refuza randul, fara sa scrie nimic", () => {
  const fields: ImportFieldDescriptor<"name">[] = [
    { field: "name", label: "Nume", required: true, example: "Ion", validate: (raw) => ({ ok: true, value: raw }) },
  ];
  const broken = prepareImportRow(["Ion �tefan"], ["name"], fields, 2);
  expect(broken.ok).toBe(false);
  if (broken.ok) throw new Error("unreachable");
  expect(broken.reason).toBe(BROKEN_LETTERS_ROW_REASON);
  const fine = prepareImportRow(["Ștefan"], ["name"], fields, 3);
  expect(fine.ok).toBe(true);
});
