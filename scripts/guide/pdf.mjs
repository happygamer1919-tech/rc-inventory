#!/usr/bin/env node
// P3-324. `npm run guide:pdf`: tipareste tot ghidul (capitole, lectii, intrebari frecvente,
// pozele de desktop) in public/guide/ghid-rapid-construct.pdf, din content/guide.
// Nu foloseste reteaua, nicio baza de date si niciun browser.

import { relative } from "node:path";
import { buildGuidePdf, PDF_FILE } from "../../lib/guide/pdf.mjs";

const hash = await buildGuidePdf();
console.log(`guide:pdf scris ${relative(process.cwd(), PDF_FILE)} (amprenta ${hash.slice(0, 12)})`);
