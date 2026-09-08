// Loturi de id-uri pentru filtrele PostgREST.
//
// DE CE EXISTA ACEST FISIER. Un filtru `.in("coloana", ids)` ajunge in ADRESA
// cererii, nu in corpul ei: `?coloana=in.(uuid,uuid,...)`. Un uuid plus virgula
// costa 37 de octeti, deci o lista care creste cu datele clientului creste
// lungimea adresei, si portarul din fata lui PostgREST refuza cererea cu
// 414 URI Too Long cand trece de bugetul lui.
//
// MASURAT, NU PRESUPUS, si masurat de doua ori. Pe stiva locala din 2026-09-04
// bisectia a dat 208 de id-uri acceptate si 209 refuzate pe interogarea liniilor
// (circa 7.7 KB de linie de cerere). Pe stiva ridicata pentru P3-38, la
// 2026-09-05, aceeasi forma a raspuns 200 la 128 de id-uri (4819 octeti de
// adresa) si 414 la 256 (9555 octeti). Forma este a unei limite de 8 KB.
//
// PRAGUL ESTE AL MEDIULUI, DECI NUMARUL DE MAI JOS NU ESTE PRAGUL. Proiectul
// gazduit sta in spatele altei infrastructuri si limita lui poate fi alta.
// Lotul este ales mult sub cel mai mic prag observat, ca sa ramana corect si pe
// un portar mai strans, si este UN SINGUR NUMAR intr-un singur loc: un al
// doilea, scris la alt apel, ar fi exact felul de prag pe care cineva il
// intalneste din nou peste un an.
//
// CAND SE POATE, LOTUL NU ESTE RASPUNSUL. O relatie reala intre tabele se cere
// prin resursa imbricata a lui PostgREST, intr-o singura cerere, si atunci nu
// mai exista nicio lista de id-uri de taiat. Vezi listReviewDrafts: liniile vin
// asa, iar loturile raman numai pentru comenzile existente, intre care si
// ciorne NU EXISTA cheie straina, deliberat (antetul migratiei 0008).

/** Cate id-uri intra intr-o singura cerere. Vezi antetul pentru masuratori. */
export const ID_LIST_BATCH_SIZE = 100;

/** Taie o lista in loturi de cel mult `size`. O lista goala da zero loturi. */
export function inBatches<T>(items: readonly T[], size: number = ID_LIST_BATCH_SIZE): T[][] {
  if (size < 1) throw new Error(`marimea lotului trebuie sa fie cel putin 1, a fost ${size}`);
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
