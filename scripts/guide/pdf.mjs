#!/usr/bin/env node
// P3-324, P3-328. `npm run guide:pdf [rol]`: tipareste ghidul pentru un rol (implicit owner,
// adica tot ghidul) in out/ghid-rapid-construct.pdf, din content/guide. Fisierul nu se
// pune in repo si nu sta in public/: utilizatorii descarca PDF-ul de la /api/guide/pdf,
// tiparit pentru rolul lor, numai dupa autentificare.
// Nu foloseste reteaua, nicio baza de date si niciun browser.

import { relative } from "node:path";
import { buildGuidePdf, PDF_FILE } from "../../lib/guide/pdf.mjs";

const role = process.argv[2] ?? "owner";
const hash = await buildGuidePdf(PDF_FILE, role);
console.log(`guide:pdf (${role}) scris ${relative(process.cwd(), PDF_FILE)} (amprenta ${hash.slice(0, 12)})`);
