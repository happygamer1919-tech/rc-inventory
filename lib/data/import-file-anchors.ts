// P3-301. DUBLATELE DIN ACELASI FISIER SE VAD PE TOT FISIERUL, nu numai in lotul lor.
//
// Verificarea trimite fisierul pe loturi de IMPORT_BATCH_SIZE randuri (P3-211, vezi
// lib/data/import-batches.ts), iar fiecare plan vedea numai lotul lui. Doua randuri cu
// acelasi telefon la randul 50 si la randul 350 apareau amandoua ca "Noi", iar la scriere
// al doilea se recunostea ca dublat al primului: numerele din previzualizare nu se potriveau
// cu ce se scria.
//
// CUM SE REZOLVA. Fiecare plan isi tine deja o harta "cheie de dublare -> primul rand bun
// care a purtat-o" (fileByPhone, fileByEmail, inFile...). Harta aceea se intoarce acum
// impreuna cu planul lotului (`anchors`), ecranul o aduna si o trimite la lotul urmator
// (`earlier`), iar planul lotului urmator porneste cu ea deja plina. Asa regulile de dublare
// raman EXACT cele din planuri, inclusiv "un rand cu eroare sau dublat al unui client stocat
// nu devine ancora": ancorele sunt numai randurile pe care serverul le-a socotit noi.
//
// NUMELE NU SE TRIMITE inapoi: nicio parte a ecranului nu citeste numele randului cu care s-a
// potrivit un dublat din fisier, iar a-l trimite ar mari fiecare apel. Cheia si linia ajung.
//
// LA SCRIERE NU SE TRIMIT ANCORE. Loturile se scriu pe rand, iar un rand dintr-un lot
// mai tarziu isi gaseste primul rand deja in baza si se recunoaste ca dublat al lui (planul
// il numeste "stocat"). A-l numi si "din fisier" ar face scrierea sa astepte o completare
// in fisier a unui rand scris deja.
//
// Pur, fara React si fara server.

/** Cheia (cu prefixul hartii ei) si linia primului rand bun care a purtat-o. */
export type FileAnchor = [key: string, line: number];

/** Cat pot cantari, cel mult, ancorele trimise la un lot. Impreuna cu IMPORT_BATCH_BYTES
 *  (150 KB) raman sub limita de 1 MB a cadrului. Peste prag se trimit doar primele, iar
 *  ecranul spune asta pe pasul "Verifică" (IMPORT_ANCHORS_CAPPED): restul se recunosc la
 *  scriere, ca inainte de P3-301.
 *
 *  P3-307: era 300 KB si se umplea la cateva mii de randuri, deci detectarea dublatelor
 *  dintre loturi se oprea fara niciun semn. 800 KB incap pentru un fisier de 10 000 de
 *  randuri cu telefon si email (cam 62 de octeti pe rand). */
export const IMPORT_ANCHOR_BYTES = 800_000;

/** P3-307. Spus pe pasul "Verifică" cand ancorele au depasit pragul. Numerele de pe ecran
 *  nu includ atunci dublatele dintre loturi de dupa prag; la scriere ele se recunosc oricum. */
export const IMPORT_ANCHORS_CAPPED =
  "Fișierul este foarte mare, așa că verificarea nu a putut compara toate rândurile între ele. " +
  "Numărul de rânduri dublate de mai jos poate fi mai mic decât cel real. La import, un rând " +
  "care există deja în fișier sau în listă este oricum recunoscut și sărit.";

/** O harta "cheie -> primul rand bun", pornita din ancorele loturilor de dinainte. */
export class FileAnchors {
  private readonly found = new Map<string, { line: number; name: string }>();
  private readonly added: FileAnchor[] = [];

  constructor(
    earlier: readonly FileAnchor[] | undefined,
    private readonly prefix: string,
  ) {
    const head = `${prefix}:`;
    for (const [key, line] of earlier ?? []) {
      if (key.startsWith(head)) this.found.set(key.slice(head.length), { line, name: "" });
    }
  }

  get(key: string): { line: number; name: string } | undefined {
    return this.found.get(key);
  }

  has(key: string): boolean {
    return this.found.has(key);
  }

  set(key: string, value: { line: number; name: string }): void {
    this.found.set(key, value);
    this.added.push([`${this.prefix}:${key}`, value.line]);
  }

  /** Ancorele adaugate de lotul acesta, fara cele primite. */
  newAnchors(): FileAnchor[] {
    return this.added;
  }
}

/** Ancorele primite de la ecran, curatate: o cerere care trimite altceva nu strica planul,
 *  doar nu are ancore. Ancorele schimba numai ce arata previzualizarea, niciodata ce se scrie. */
export function readAnchors(raw: unknown): FileAnchor[] {
  if (!Array.isArray(raw)) return [];
  const kept: FileAnchor[] = [];
  for (const item of raw) {
    if (kept.length >= 2 * IMPORT_ANCHOR_ROWS) break;
    if (!Array.isArray(item)) continue;
    const [key, line] = item as unknown[];
    if (typeof key === "string" && typeof line === "number" && Number.isInteger(line) && line > 0)
      kept.push([key, line]);
  }
  return kept;
}

/** Fiecare rand poate lasa cel mult doua ancore (telefon si email, SKU si denumire). */
const IMPORT_ANCHOR_ROWS = 10_000;

/** Aduna ancorele loturilor terminate, in ordinea fisierului, fara sa treaca de prag.
 *  Intoarce adevarat cand cel putin o ancora a ramas pe dinafara (P3-307). */
export function addAnchors(
  into: { anchors: FileAnchor[]; bytes: number },
  more: readonly FileAnchor[] | undefined,
): boolean {
  if (!more) return false;
  const encoder = new TextEncoder();
  for (const anchor of more) {
    // Cheia, linia si ghilimelele cu virgulele din JSON.
    const size = encoder.encode(anchor[0]).length + String(anchor[1]).length + 8;
    if (into.bytes + size > IMPORT_ANCHOR_BYTES) return true;
    into.anchors.push(anchor);
    into.bytes += size;
  }
  return false;
}
