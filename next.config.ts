import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/security-headers";

// P2-11. Antetele de securitate, aplicate de framework si nu de un middleware
// scris de mana.
//
// FARA STEAGURI EXPERIMENTALE. Cardul cere configurarea documentata a lui Next,
// si atat: un steag experimental pe primul sistem de productie al unui client
// este un pariu cu afacerea altcuiva. headers() este API stabil si ruleaza pe
// TOATE raspunsurile, inclusiv cele ale rutelor API si ale fisierelor statice,
// deci o ruta noua este acoperita fiindca este noua.
//
// LISTA INSASI STA IN lib/security-headers.ts, fiindca proxy.ts pune aceleasi
// antete pe raspunsurile pe care le produce EL, si care nu mai ajung niciodata
// aici: redirectarea catre autentificare si rescrierea catre acces interzis.
// Motivele fiecarui antet, si de ce CSP-ul are o singura directiva, sunt scrise
// acolo, langa valori.

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

  // P3-272. PDF-ul facturii. pdfkit ramane in afara pachetului (se incarca din
  // node_modules), iar cele trei fisiere pe care ruta le citeste de pe disc, fonturile
  // si sigla, se pun explicit in pachetul ei: o citire cu cale calculata nu o vede
  // trasarea automata, si pe Vercel fisierul ar lipsi exact la prima descarcare.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/facturare/[id]/pdf": ["./lib/pdf/fonts/*.ttf", "./public/brand/rapid-construct-logo.png"],
    // P3-321. Paginile /ajutor citesc lectiile si pozele de pe disc la fiecare cerere
    // (lib/guide/read.ts). Fara randul acesta fisierele nu ajung in functia serverless,
    // iar ghidul ar fi gol in productie desi local arata bine.
    // P3-328. Pozele nu mai sunt in public/: ruta lor si ruta PDF-ului le citesc din
    // content/guide-images, iar PDF-ul mai citeste fonturile.
    "/ajutor": ["./content/guide/**/*.md", "./content/guide-images/*.png"],
    "/ajutor/[lectie]": ["./content/guide/**/*.md", "./content/guide-images/*.png"],
    "/api/guide/poza/[nume]": ["./content/guide/**/*.md", "./content/guide-images/*.png"],
    "/api/guide/pdf": ["./content/guide/**/*.md", "./content/guide-images/*.png", "./lib/pdf/fonts/*.ttf", "./lib/guide/pdf.mjs"],
  },

  async headers() {
    // Copie, fiindca Next cere un tablou mutabil si lista este readonly:
    // o singura definitie nu are voie sa fie modificabila de consumatorii ei.
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
