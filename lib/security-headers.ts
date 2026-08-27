// P2-11. Antetele de securitate, definite O SINGURA DATA.
//
// Doua locuri le pun pe raspunsuri si ele trebuie sa fie aceleasi antete:
//
//   next.config.ts  le pune pe raspunsurile care ajung in randare, adica pe
//                   fiecare pagina si pe fiecare ruta API.
//   proxy.ts        le pune pe raspunsurile pe care le produce EL si care nu
//                   mai ajung niciodata la randare: redirectarea catre
//                   autentificare si rescrierea catre ecranul de acces interzis.
//
// DE CE CONTEAZA A DOUA. Prima pagina pe care o vede un vizitator neautentificat
// nu este o pagina: este redirectarea proxy-ului catre autentificare. Daca ea
// nu poarta Strict-Transport-Security, primul contact al browserului cu domeniul
// se face fara politica, ceea ce este exact contactul pe care HSTS exista sa il
// acopere. Aceeasi logica pentru celelalte: un antet care lipseste de pe o
// singura clasa de raspunsuri este un antet pe care nu te poti baza.
//
// O lista, doi consumatori. Doua liste ar fi doua liste care diverg.

export const SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  // Doi ani, cu subdomenii, pregatit pentru lista de preincarcare. Domeniul este
  // servit exclusiv prin HTTPS. Browserele ignora antetul in afara HTTPS, prin
  // specificatie, deci pe http://localhost nu are efect si nu strica nimic.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Fara ghicitul tipului de continut. Un document al furnizorului servit vreodata
  // cu tipul gresit nu are voie sa fie executat ca script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Aplicatia nu este incadrata nicaieri, niciodata.
  { key: "X-Frame-Options", value: "DENY" },
  // Echivalentul modern al liniei de mai sus, pentru browserele care il prefera.
  // O SINGURA directiva, si asta este deliberat: frame-ancestors nu poate bloca
  // niciun script, deci "dovedit ca nu strica aplicatia" se verifica citind-o.
  // script-src si restul ar cere o conducta de nonce prin toata randarea, ceea ce
  // defaults-ul cardului P2-11 interzice; raman un card viitor.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Adresa completa nu pleaca catre alta origine: caile acestei aplicatii contin
  // identificatori de comenzi si de produse.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nimic din ce aplicatia nu foloseste nu ramane disponibil.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** Pune antetele pe un raspuns produs de proxy. Intoarce acelasi raspuns. */
export function applySecurityHeaders<T extends { headers: Headers }>(response: T): T {
  for (const { key, value } of SECURITY_HEADERS) response.headers.set(key, value);
  return response;
}
