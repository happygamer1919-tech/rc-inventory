"use client";

// Blocul Facturare din Setari. Cardul P3-108, goal G65 partea 1.
//
// ESTE SINGURUL LUCRU CARE SE VEDE PE ECRAN DIN ACEST CARD. Nu exista intrare in
// meniu, nu exista ruta /facturare si nu exista nicio pagina de factura: acelea
// sunt partile 2 si 3 ale obiectivului G65 si sunt carduri separate. Regula
// existenta, ca nimic sa nu apara in meniu inainte sa poata fi folosit, este chiar
// motivul pentru care datele vin intai si meniul vine cu partea 2.
//
// NU EXISTA STERGERE, si nu din lipsa de timp. Nu exista rand de sters: tabela
// public.invoice_settings are un singur rand, scris de migratia 0063, si nici
// authenticated nici proprietarul nu au drept de delete pe ea. Ce se face aici
// este exact un UPDATE.
//
// COTA TVA POARTA O NOTA PE ECRAN, si nota nu este decorativa: nimeni din echipa
// de construit nu are raspunsul unui contabil despre ce cota se aplica
// materialelor de construcție in Moldova. Un ecran care ar arata 20 % fara nota ar
// prezenta o presupunere ca pe un fapt.
//
// canWrite ESTE O A DOUA LINIE SI NU PRIMA, exact ca la CategorySettings. Ruta
// /setari este declarata a proprietarului in lib/routes.ts
// (OWNER_ONLY_PREFIXES), deci proxy.ts intoarce ecranul 403 unui operator inainte
// ca pagina sa fie randata, iar ramura read-only de mai jos nu se atinge pe aceasta
// ruta. Se pastreaza fiindca proprietatea este adevarata despre component si nu
// despre ruta: politica invoice_settings_owner_update refuza oricum scrierea, iar
// un component care si-ar desena butonul pe orice ecran l-ar monta ar fi un
// component care minte. Cazul 3 din tests/e2e/facturare-settings.spec.ts probeaza
// refuzul acolo unde chiar se intampla, pe ruta si pe tabela.
//
// P3-64 si P3-65. PE TELEFON (sub 768px) campurile stau unul sub altul si fiecare
// tinta are 44px; peste 768px nimic nu se schimba. Numele de clase se importa din
// components/ui/phone.ts, nu se scriu local: asta a curatat obiectivul G56.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { PHONE_CHECK, PHONE_STACK, PHONE_TAP } from "@/components/ui/phone";
import { invoiceNumberExample, VAT_NOTE, type InvoiceSettings } from "@/lib/data/facturare-types";
import { saveInvoiceSettings } from "@/lib/data/facturare-actions";

/** Cum ajunge cota pe ecran: 20 si nu 20.00, 20,5 si nu 20.5. */
function rateText(value: number): string {
  return String(value).replace(".", ",");
}

export function FacturareSettings({
  settings,
  canWrite,
  year,
}: {
  /** Null cand migratia 0063 nu este inca aplicata pe baza catre care arata
   *  aplicatia, sau cand cel care se uita nu are voie sa citeasca randul. In
   *  amandoua cazurile ecranul spune romaneste ce se intampla si nu cade. */
  settings: InvoiceSettings | null;
  canWrite: boolean;
  /** Anul curent, citit pe server: o valoare calculata in browser ar face ca
   *  exemplul sa se schimbe intre randare si hidratare la trecerea dintre ani. */
  year: number;
}) {
  const router = useRouter();
  const [prefix, setPrefix] = React.useState(settings?.seriesPrefix ?? "RC-");
  const [withYear, setWithYear] = React.useState(settings?.numberIncludesYear ?? true);
  const [rate, setRate] = React.useState(settings ? rateText(settings.defaultVatRate) : "20");
  const [name, setName] = React.useState(settings?.issuerName ?? "");
  const [fiscalCode, setFiscalCode] = React.useState(settings?.issuerFiscalCode ?? "");
  const [address, setAddress] = React.useState(settings?.issuerAddress ?? "");
  const [bank, setBank] = React.useState(settings?.issuerBank ?? "");
  const [iban, setIban] = React.useState(settings?.issuerIban ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    const result = await saveInvoiceSettings({
      seriesPrefix: prefix,
      numberIncludesYear: withYear,
      defaultVatRate: rate,
      issuerName: name,
      issuerFiscalCode: fiscalCode,
      issuerAddress: address,
      issuerBank: bank,
      issuerIban: iban,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  // Card nu primeste data-testid (components/ui/primitives.tsx:19), deci blocul
  // este invelit intr-o secțiune care il poarta, ca in restul ecranelor.
  return (
    <section data-testid="settings-facturare">
    <Card className="mb-5">
      <CardHeader
        title="Facturare"
        hint="Cum se numerotează facturile și ce date ale firmei apar pe ele."
      />

      {settings === null ? (
        <p className="px-5 py-10 text-center text-[13px] text-rc-muted" data-testid="facturare-inactive">
          Facturarea nu este încă activă pe această bază de date. Setările apar aici imediat ce
          structura de facturare este aplicată.
        </p>
      ) : (
        <form onSubmit={onSave} className="px-5 py-4">
          <div className={`grid gap-4 md:grid-cols-2 ${PHONE_STACK}`}>
            <Field label="Prefixul seriei" required className="min-w-0">
              <Input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                disabled={!canWrite}
                placeholder="RC-"
                data-testid="facturare-series-prefix"
              />
              {/* EXEMPLUL ARE PROPRIUL data-testid, si nu mai sta in hint-ul
                  campului, exact din motivul scris mai jos la nota de TVA:
                  specificatia il citeste cuvant cu cuvant. Cardul P3-115,
                  constatarea G15: cu prefixul implicit `RC-` si anul stins, seria
                  este chiar `RC-` si numarul scris era `RC--0001`, cu doua cratime,
                  pe fiecare factura. Exemplul de aici aplica aceeasi regula ca
                  numarul real, deci el este si locul in care se vede reparatia
                  inainte ca setarea sa fie salvata. */}
              <span
                className="mt-1 block text-[12px] text-rc-muted"
                data-testid="facturare-number-example"
              >
                {`Numărul următoarei facturi va arăta așa: ${invoiceNumberExample(prefix, withYear, year)}`}
              </span>
            </Field>

            <Field label="Cota TVA implicită (%)" required className="min-w-0">
              <Input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                disabled={!canWrite}
                inputMode="decimal"
                placeholder="20"
                data-testid="facturare-vat-rate"
              />
              {/* Nota sta aici si nu in hint-ul campului, ca sa aiba propriul
                  data-testid: spec-ul o citeste cuvant cu cuvant. */}
              <span
                className="mt-1 block text-[12px] font-semibold text-rc-orange"
                data-testid="facturare-vat-note"
              >
                {VAT_NOTE}
              </span>
            </Field>
          </div>

          <label
            className={`mt-3 flex items-center gap-2 text-[13px] text-rc-black ${PHONE_CHECK}`}
          >
            <input
              type="checkbox"
              checked={withYear}
              onChange={(e) => setWithYear(e.target.checked)}
              disabled={!canWrite}
              className="h-4 w-4 accent-rc-orange"
              data-testid="facturare-year"
            />
            Anul intră în numărul facturii
          </label>

          <p className="mt-5 mb-2 text-[12.5px] font-semibold text-rc-black">
            Datele Rapid Construct, care apar pe factură
          </p>

          <div className={`grid gap-4 md:grid-cols-2 ${PHONE_STACK}`}>
            <Field label="Denumirea firmei" className="min-w-0">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canWrite}
                placeholder="Rapid Construct SRL"
                data-testid="facturare-issuer-name"
              />
            </Field>
            <Field label="IDNO" className="min-w-0">
              <Input
                value={fiscalCode}
                onChange={(e) => setFiscalCode(e.target.value)}
                disabled={!canWrite}
                data-testid="facturare-issuer-fiscal-code"
              />
            </Field>
            <Field label="Adresa" className="min-w-0">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!canWrite}
                data-testid="facturare-issuer-address"
              />
            </Field>
            <Field label="Banca" className="min-w-0">
              <Input
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                disabled={!canWrite}
                data-testid="facturare-issuer-bank"
              />
            </Field>
            <Field label="IBAN" className="min-w-0">
              <Input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                disabled={!canWrite}
                data-testid="facturare-issuer-iban"
              />
            </Field>
          </div>

          {error ? (
            <p
              role="alert"
              data-testid="facturare-error"
              className="mt-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {error}
            </p>
          ) : null}

          {saved ? (
            <p className="mt-4 text-[12.5px] text-rc-muted" data-testid="facturare-done">
              Setările au fost salvate.
            </p>
          ) : null}

          {canWrite ? (
            <div className="mt-4 flex max-md:flex-col max-md:items-stretch">
              <Button type="submit" disabled={pending} data-testid="facturare-save" className={PHONE_TAP}>
                {pending ? "Se salvează..." : "Salvează setările"}
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] text-rc-muted" data-testid="facturare-read-only">
              Doar administratorul poate modifica aceste setări.
            </p>
          )}
        </form>
      )}
    </Card>
    </section>
  );
}
