import type { NextConfig } from "next";

// P2-11. Antetele de securitate, aplicate de framework si nu de un middleware
// scris de mana.
//
// FARA STEAGURI EXPERIMENTALE. Cardul cere configurarea documentata a lui Next,
// si atat: un steag experimental pe primul sistem de productie al unui client
// este un pariu cu afacerea altcuiva. headers() este API stabil si ruleaza pe
// TOATE raspunsurile, inclusiv cele ale rutelor API si ale fisierelor statice,
// deci o ruta noua este acoperita fiindca este noua.
//
// CSP-UL DE AICI ARE O SINGURA DIRECTIVA, SI ASTA ESTE DELIBERAT.
//
// Cardul spune raspicat ca un Content-Security-Policy se include NUMAI daca se
// poate dovedi ca nu strica aplicatia, fiindca un CSP care blocheaza tacut un
// script este mai rau decat lipsa lui. frame-ancestors nu poate bloca niciun
// script: singurul lucru pe care il restrange este cine are voie sa incadreze
// pagina, deci este exact echivalentul modern al lui X-Frame-Options pe care
// cardul il numeste ca alternativa acceptata, si dovada ca nu strica nimic este
// citirea directivei.
//
// Ce NU este aici: script-src, style-src si restul. Next injecteaza scripturi
// inline pentru hidratare si pentru fluxul RSC, deci un CSP care le acopera
// inseamna o conducta de nonce prin toata randarea, exact lucrul pe care
// defaults il interzice pe acest card. Ramane un card viitor, scris aici ca sa
// nu para o scapare.
//
// Strict-Transport-Security se trimite si pe http://localhost. Browserele il
// ignora in afara HTTPS, prin specificatie, deci nu are efect in dezvoltare si
// nu poate bloca serverul local; il trimitem neconditionat ca antetul sa fie
// acelasi lucru peste tot si sa poata fi verificat de suita.
const SECURITY_HEADERS = [
  {
    // Doi ani, cu subdomenii, pregatit pentru lista de preincarcare. Domeniul
    // este servit exclusiv prin HTTPS de Vercel.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Oprește ghicitul tipului de continut. Un document incarcat de operator si
    // servit vreodata gresit nu are voie sa fie executat ca script.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Aplicatia nu este incadrata nicaieri, niciodata.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Echivalentul modern al liniei de mai sus, pentru browserele care il
    // prefera. Amandoua, fiindca acoperirea lor nu este identica.
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  },
  {
    // Adresa completa nu pleaca niciodata catre alta origine. Caile acestei
    // aplicatii contin identificatori de comenzi si de produse.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Nimic din ce aplicatia nu foloseste nu ramane disponibil.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // P2-11. Unde se aseaza build-ul, citit din mediu.
  //
  // Suita are nevoie de un server IN MOD PRODUCTIE, fiindca defaults-ul acestui
  // card cere zero erori de consola "intr-un build de productie" si fiindca
  // antetele se verifica pe un raspuns de productie. Serverul de dezvoltare si
  // cel de productie ruleaza in acelasi timp sub Playwright si amandoua scriu in
  // acelasi dosar de build, deci unul l-ar suprascrie pe celalalt in timp ce
  // rula. Variabila de mai jos le tine separate. Nesetata, nu schimba nimic.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Next 16 genereaza automat AGENTS.md si CLAUDE.md in radacina.
  // Le oprim: nu sunt cerute de board si nu vrem fisiere negenerate de noi in repo.
  agentRules: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
