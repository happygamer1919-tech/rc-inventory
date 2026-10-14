import { expect, test } from "@playwright/test";
import { LIST_CHANGED_MESSAGE, READ_ATTEMPTS, readAllPages, type CountedPage } from "@/lib/data/id-list";

// P3-287. Un rand deja citit se muta dupa cursor intre doua pagini: un rand viu este
// sarit, fara eroare. Fara baza de date si fara browser, impotriva unui server fals.
//
// SERVERUL FALS ARE O LISTA ORDONATA CARE SE POATE MODIFICA intre cereri, ca
// PostgREST cu un coleg care salveaza: `fetchPage` taie dupa pozitie, `fetchIds`
// aduce aceeasi lista numai cu id-uri, iar `afterRequest` ruleaza dupa a n-a cerere
// de rand si este locul in care colegul schimba lista.

type Row = { id: string; name: string };

const NAMES = Array.from({ length: 23 }, (_, i) => `r${String(i).padStart(2, "0")}`);
const rowOf = (id: string): Row => ({ id, name: `nume ${id}` });
const PAGE = 10;
const WHAT = "randurile de proba";

function server(initial: string[]) {
  const state = {
    ids: [...initial],
    pageRequests: 0,
    idRequests: 0,
    onPage: (_n: number, _from: number) => {},
  };
  const fetchPage = async (from: number, to: number): Promise<CountedPage<Row>> => {
    const data = state.ids.slice(from, to + 1).map(rowOf);
    const count = state.ids.length;
    state.pageRequests++;
    state.onPage(state.pageRequests, from);
    return { data, count, error: null };
  };
  const fetchIds = async (from: number, to: number): Promise<CountedPage<{ id: string }>> => {
    state.idRequests++;
    return { data: state.ids.slice(from, to + 1).map((id) => ({ id })), count: state.ids.length, error: null };
  };
  return { state, fetchPage, fetchIds };
}

/** Dupa prima pagina, `r03` (deja citit) primeste un nume care il pune la sfarsit. */
const moveR03ToEnd = (state: { ids: string[] }) => {
  state.ids = state.ids.filter((id) => id !== "r03").concat("r03");
};

test("P3-287: un rand deja citit mutat dupa cursor sare un rand viu cand citirea nu are control de id-uri (cazul de dinainte)", async () => {
  const { state, fetchPage } = server(NAMES);
  state.onPage = (n) => {
    if (n === 1) moveR03ToEnd(state);
  };

  const got = await readAllPages<Row>(WHAT, fetchPage, PAGE);
  expect(got.length, "numarul iese bun, deci nimic nu se vede").toBe(NAMES.length);
  const ids = got.map((r) => r.id);
  expect(ids, "r10 a fost sarit, iar r03 vine de doua ori").not.toContain("r10");
  expect(ids.filter((id) => id === "r03")).toHaveLength(2);
});

test("P3-287: cu control de id-uri, randul mutat reia citirea si lista iese intreaga, fara cheie", async () => {
  const { state, fetchPage, fetchIds } = server(NAMES);
  state.onPage = (n) => {
    if (n === 1) moveR03ToEnd(state);
  };

  const got = await readAllPages<Row>(WHAT, fetchPage, PAGE, undefined, fetchIds);
  // Lista adevarata dupa mutare: r03 este ultimul. Fiecare rand viu apare o data.
  expect(got.map((r) => r.id)).toEqual(state.ids);
  expect(new Set(got.map((r) => r.id)).size).toBe(NAMES.length);
  expect(got.map((r) => r.id)).toContain("r10");
});

test("P3-287: cu cheie si control, dublura reia citirea inainte de controlul de id-uri", async () => {
  const { state, fetchPage, fetchIds } = server(NAMES);
  state.onPage = (n) => {
    if (n === 1) moveR03ToEnd(state);
  };

  const got = await readAllPages<Row>(WHAT, fetchPage, PAGE, (r) => r.id, fetchIds);
  expect(got.map((r) => r.id)).toEqual(state.ids);
});

test("P3-287: un rand sters si altul adaugat la sfarsit lasa totalul egal si nicio dublura, dar controlul de id-uri vede randul sarit", async () => {
  const { state, fetchPage, fetchIds } = server(NAMES);
  state.onPage = (n) => {
    // r03 (deja citit) se sterge, r99 se adauga la sfarsit: totalul ramane 23, nicio cheie nu se repeta.
    if (n === 1) state.ids = state.ids.filter((id) => id !== "r03").concat("r99");
  };

  // Fara control: lista iese cu 23 de randuri, fara dubluri, fara r10 si fara nicio eroare.
  const blind = await readAllPages<Row>(WHAT, fetchPage, PAGE, (r) => r.id);
  expect(blind.length).toBe(23);
  expect(blind.map((r) => r.id)).not.toContain("r10");

  // Cu control: citirea se reia pe lista care sta acum, si r10 este in ea.
  const second = server(NAMES);
  second.state.onPage = (n) => {
    if (n === 1) second.state.ids = second.state.ids.filter((id) => id !== "r03").concat("r99");
  };
  const got = await readAllPages<Row>(WHAT, second.fetchPage, PAGE, (r) => r.id, second.fetchIds);
  expect(got.map((r) => r.id)).toEqual(second.state.ids);
  expect(got.map((r) => r.id)).toContain("r10");
});

test("P3-287: mutarea se repeta la fiecare incercare: mesajul listei schimbate, dupa READ_ATTEMPTS citiri", async () => {
  const { state, fetchPage, fetchIds } = server(NAMES);
  // Dupa prima pagina a fiecarei incercari, un coleg muta primul rand, deja citit, la sfarsit.
  state.onPage = (_n, from) => {
    if (from !== 0) return;
    const [first] = state.ids;
    state.ids = state.ids.slice(1).concat(first);
  };
  await expect(readAllPages<Row>(WHAT, fetchPage, PAGE, undefined, fetchIds)).rejects.toThrow(
    LIST_CHANGED_MESSAGE,
  );
  expect(state.pageRequests, "trei pagini pe incercare, fiecare incercare cu controlul ei").toBe(READ_ATTEMPTS * 3);
  expect(state.idRequests).toBe(READ_ATTEMPTS * 3);
});

test("P3-287: o lista dintr-o singura pagina nu face nicio citire de control", async () => {
  const { state, fetchPage, fetchIds } = server(NAMES.slice(0, 7));
  const got = await readAllPages<Row>(WHAT, fetchPage, PAGE, undefined, fetchIds);
  expect(got).toHaveLength(7);
  expect(state.pageRequests).toBe(1);
  expect(state.idRequests).toBe(0);
});

test("P3-287: o lista stabila pe mai multe pagini se citeste o data si se controleaza o data, cu aceleasi id-uri", async () => {
  const { state, fetchPage, fetchIds } = server(NAMES);
  const got = await readAllPages<Row>(WHAT, fetchPage, PAGE, undefined, fetchIds);
  expect(got.map((r) => r.id)).toEqual(NAMES);
  expect(state.pageRequests).toBe(3);
  expect(state.idRequests).toBe(3);
});

test("P3-287: o eroare la citirea de control este un esec cu numele listei, nu o lista fara control", async () => {
  const { fetchPage } = server(NAMES);
  await expect(
    readAllPages<Row>(WHAT, fetchPage, PAGE, undefined, async () => ({
      data: null,
      count: null,
      error: { message: "refuzat" },
    })),
  ).rejects.toThrow(`Nu s-au putut citi ${WHAT} (id-uri): refuzat`);
});

test("P3-287: un rand fara id text si fara keyOf nu se poate controla, si asta este o eroare de apel, nu o lista scurta", async () => {
  await expect(
    readAllPages<number>(
      WHAT,
      async (from, to) => ({ data: NAMES.map((_, i) => i).slice(from, to + 1), count: NAMES.length, error: null }),
      PAGE,
      undefined,
      async () => ({ data: [], count: 0, error: null }),
    ),
  ).rejects.toThrow("keyOf");
});
