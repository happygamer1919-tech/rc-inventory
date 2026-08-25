// P2-06 Incarca comanda.
//
// CE ESTE ACEST ECRAN ACUM. Documentul furnizorului se incarca real, in bucketul
// privat rc-docs, si ramane atasat comenzii. Ce NU face inca este sa citeasca
// singur din document: extragerea automata prin Make apartine cardului P2-08, iar
// ecranul de verificare a extragerii apartine lui P2-09.
//
// De ce nu a ramas simularea din faza 1: acest card sterge stratul demonstrativ
// din tot depozitul de cod, iar o animatie de procesare care umple formularul cu
// date inventate ar fi, intr-un sistem care acum scrie in baza, o minciuna.
// Ecranul spune pe fata ce face si ce urmeaza.

import { listActiveProducts, listSupplierNames } from "@/lib/data/products";
import { UploadOrderScreen } from "@/components/orders/UploadOrderScreen";

export const dynamic = "force-dynamic";

export default async function UploadOrderPage() {
  const [products, suppliers] = await Promise.all([listActiveProducts(), listSupplierNames()]);
  return <UploadOrderScreen products={products} suppliers={suppliers} />;
}
