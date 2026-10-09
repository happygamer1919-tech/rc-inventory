// P3-145. Codarea fisierelor CSV si linia de aparare de pe server. Specificatii
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

test("codare csv: windows-1250 cu Bălți si Würth ramane romanesc", () => {
  const bytes = [
    ...ascii("B"), 0xe3, ...ascii("l"), 0xfe, ...ascii("i;W"), 0xfc, ...ascii("rth;"),
    0xaa, ...ascii("tefan;"), 0xde, ...ascii("urcanu;Ia"), 0xba, ...ascii("i"),
  ];
  const result = decodeCsvFile(buffer(bytes));
  expect(result).toEqual({ text: "Bălți;Würth;Ștefan;Țurcanu;Iași", encoding: "windows-1250" });
});

test("codare csv: windows-1250 cu André si Kärcher ramane romanesc", () => {
  const bytes = [
    ...ascii("Andr"), 0xe9, ...ascii(";K"), 0xe4, ...ascii("rcher;B"), 0xe3, ...ascii("l"), 0xfe, ...ascii("i;"),
    0xaa, ...ascii("tefan;Chi"), 0xba, ...ascii("in"), 0xe3, ...ascii("u"),
  ];
  const result = decodeCsvFile(buffer(bytes));
  expect(result).toEqual({ text: "André;Kärcher;Bălți;Ștefan;Chișinău", encoding: "windows-1250" });
});

test("codare csv: windows-1251 cu Иван Петров se citeste corect", () => {
  const bytes = [
    0xc8, 0xe2, 0xe0, 0xed, 0x20, 0xcf, 0xe5, 0xf2, 0xf0, 0xee, 0xe2,
  ];
  const result = decodeCsvFile(buffer(bytes));
  expect(result).toEqual({ text: "Иван Петров", encoding: "windows-1251" });
});

// P3-207. Windows-1251: А-я (U+0410-U+044F) sunt octetii C0-FF.
function cp1251(text: string): number[] {
  return [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    return code >= 0x410 && code <= 0x44f ? code - 0x410 + 0xc0 : code;
  });
}

test("codare csv P3-207: windows-1251 mostly Latin cu ООО Строй se citeste ca rusa", () => {
  const text = "Nume;Firma\nSC Alpha SRL;ООО Строй\nBeta Trading;Gamma";
  const result = decodeCsvFile(buffer(cp1251(text)));
  expect(result).toEqual({ text, encoding: "windows-1251" });
});

test("codare csv P3-207: windows-1250 cu î â ă ș ț ramane romanesc", () => {
  // î EE, â E2, ă E3, ş BA, ţ FE, Î CE, Â C2, Ă C3, Ş AA, Ţ DE (sedila, ca in Excel).
  const bytes = [
    0xce, ...ascii("n Rom"), 0xe2, ...ascii("nia, B"), 0xe3, ...ascii("l"), 0xfe, ...ascii("i, Ia"),
    0xba, ...ascii("i, via"), 0xfe, 0xe3, ...ascii(", "), 0xc2, ...ascii("ntors, "), 0xc3, ...ascii("sta, "),
    0xaa, ...ascii("tefan, "), 0xde, ...ascii("ara, W"), 0xfc, ...ascii("rth"),
  ];
  const result = decodeCsvFile(buffer(bytes));
  expect(result).toEqual({
    text: "În România, Bălți, Iași, viață, Ântors, Ăsta, Ștefan, Țara, Würth",
    encoding: "windows-1250",
  });
});

test("codare csv P3-207: un fisier numai rusesc ramane windows-1251", () => {
  const text = "Название;Количество\nОтвертка;12\nМолоток;5";
  const result = decodeCsvFile(buffer(cp1251(text)));
  expect(result).toEqual({ text, encoding: "windows-1251" });
});

test("codare csv P3-207: UTF-8 cu chirilica ramane neschimbat", () => {
  const text = "Nume;Firma\nSC Alpha SRL;ООО Строй";
  const result = decodeCsvFile(buffer([...new TextEncoder().encode(text)]));
  expect(result).toEqual({ text, encoding: "utf-8" });
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

function utf16le(text: string, bom: boolean): number[] {
  const out: number[] = bom ? [0xff, 0xfe] : [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out.push(c & 0xff, c >> 8);
  }
  return out;
}

function utf16be(text: string, bom: boolean): number[] {
  const out: number[] = bom ? [0xfe, 0xff] : [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out.push(c >> 8, c & 0xff);
  }
  return out;
}

test("codare csv P3-194: UTF-16 LE cu BOM (Unicode Text din Excel) se citeste corect", () => {
  const result = decodeCsvFile(buffer(utf16le("Nume\tOraș\nȘtefan Țurcanu\tBălți", true)));
  expect(result).toEqual({ text: "Nume\tOraș\nȘtefan Țurcanu\tBălți", encoding: "utf-16le" });
});

test("codare csv P3-194: UTF-16 BE cu BOM si UTF-16 LE fara BOM se citesc corect", () => {
  expect(decodeCsvFile(buffer(utf16be("Nume\nIași", true)))).toEqual({
    text: "Nume\nIași",
    encoding: "utf-16be",
  });
  expect(decodeCsvFile(buffer(utf16le("Nume\nIasi", false)))).toEqual({
    text: "Nume\nIasi",
    encoding: "utf-16le",
  });
});

test("codare csv P3-194: UTF-16 taiat la jumatatea unui caracter este refuzat", () => {
  const bytes = utf16le("Nume\nIasi", true).slice(0, -1);
  expect(decodeCsvFile(buffer(bytes))).toEqual({ error: BROKEN_LETTERS_FILE_ERROR });
});

test("codare csv P3-194: UTF-8 cu un singur octet gresit este refuzat, nu citit ca 1250", () => {
  const good = [...new TextEncoder().encode("Nume\nȘtefan Țurcanu, Bălți, Iași")];
  const bytes = [...good.slice(0, 12), 0xff, ...good.slice(12)];
  expect(decodeCsvFile(buffer(bytes))).toEqual({ error: BROKEN_LETTERS_FILE_ERROR });
});

test("codare csv P3-194: octet 0x00 sau caracter de control intr-un fisier pe un octet este refuzat", () => {
  expect(decodeCsvFile(buffer([...ascii("Nume\nIon"), 0xe3, 0x00, ...ascii("x")]))).toEqual({
    error: BROKEN_LETTERS_FILE_ERROR,
  });
  expect(decodeCsvFile(buffer([...ascii("Nume\nIon"), 0xe3, 0x01, ...ascii("x")]))).toEqual({
    error: BROKEN_LETTERS_FILE_ERROR,
  });
});

test("codare csv P3-194: windows-1250 cu tab, CR si LF ramane acceptat", () => {
  const bytes = [...ascii("Nume\tOra"), 0xba, ...ascii("\r\nB"), 0xe3, ...ascii("l"), 0xfe, ...ascii("i")];
  expect(decodeCsvFile(buffer(bytes))).toEqual({
    text: "Nume\tOraș\r\nBălți",
    encoding: "windows-1250",
  });
});
