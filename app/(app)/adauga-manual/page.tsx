// P2-04 Adaugare manuala, pe date reale.
//
// Drumul de intrare care nu depinde de citirea automata, pentru furnizorul care
// nu trimite nimic utilizabil. Este aceeasi fisa pe care o va refolosi P2-09
// pentru verificarea extragerii, pornita goala.

import { listActiveProducts, listSupplierNames } from "@/lib/data/products";
import { ManualOrderScreen } from "@/components/orders/ManualOrderScreen";

export const dynamic = "force-dynamic";

export default async function ManualAddPage() {
  const [products, suppliers] = await Promise.all([listActiveProducts(), listSupplierNames()]);

  return <ManualOrderScreen products={products} suppliers={suppliers} />;
}
