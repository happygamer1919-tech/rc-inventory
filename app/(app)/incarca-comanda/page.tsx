// Incarca comanda.
//
// DOUA CAI IN, SI ELE SUNT DIFERITE PE FATA.
//
// Prima, P2-09: documentul se incarca si se citeste automat prin Make, apoi
// operatorul verifica pe ecran ce s-a extras si confirma. Comanda se naste la
// confirmare, iar pana atunci exista doar o ciorna de extragere. Documentele
// esuate si cele partiale stau in aceeasi lista, cu motivul lor, fiindca un
// esec pe care operatorul nu il vede este un document care pare ca se
// proceseaza la nesfarsit.
//
// A doua, P2-08a, ramasa neatinsa dedesubt: operatorul tasteaza comanda intai
// si ataseaza documentul la ea. Acolo comanda exista deja, deci nu e nimic de
// confirmat, si lista de mai sus nu ofera acele ciorne spre confirmare. Motivul
// intreg este in antetul migratiei 0010.

import { listActiveProducts, listCategories, listSupplierNames } from "@/lib/data/products";
import { listCancelledDrafts, listReviewDrafts } from "@/lib/data/extraction";
import { getSessionUser } from "@/lib/supabase/server";
import { ExtractionReviewPanel } from "@/components/orders/ExtractionReviewPanel";
import { UploadOrderScreen } from "@/components/orders/UploadOrderScreen";

export const dynamic = "force-dynamic";

export default async function UploadOrderPage() {
  const [products, suppliers, categories, drafts, cancelled, user] = await Promise.all([
    listActiveProducts(),
    listSupplierNames(),
    listCategories(),
    listReviewDrafts(),
    // P3-84. null cand 0056 nu este inca aplicata: atunci nu exista nici
    // butonul, nici sectiunea, si ecranul este cel de astazi.
    listCancelledDrafts(),
    getSessionUser(),
  ]);

  return (
    <>
      <ExtractionReviewPanel
        drafts={drafts}
        products={products}
        categories={categories}
        cancelled={cancelled}
        // P3-84. Butonul numai pentru proprietar. Actiunea refuza oricum pe
        // oricine altcineva; ecranul doar nu ofera ce ar fi refuzat.
        canCancel={cancelled !== null && user?.role === "owner"}
      />
      <UploadOrderScreen products={products} suppliers={suppliers} />
    </>
  );
}
