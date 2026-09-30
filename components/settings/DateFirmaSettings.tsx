"use client";

// Secțiunea Date firmă din Setări. Cardul P3-116, goal G69 partea 4, ULTIMA parte a
// acelui obiectiv.
//
// SPECIFICATIA este docs/reports/2026-09-30-author-setari-design.md, subsecțiunea
// Date firmă a secțiunii 3 si Partea 2 a secțiunii 4. Max a raspuns la intrebarea
// ei despre cele trei campuri lipsa cu un singur cuvant: da la codul TVA, la telefon
// si la email, cu migratie numai aditiva.
//
// UN SINGUR RAND, SI NU O A DOUA TABELA. Cele opt campuri de aici sunt chiar
// coloanele randului unic public.invoice_settings, pe care il citeste si blocul
// Facturare si pe care il citeste factura cand isi tipareste emitentul. Raportul
// spune de ce, intr-o propoziție care merita tinuta minte: doua locuri care tin
// IDNO-ul aceleiasi firme este exact felul in care ajung sa se contrazica, iar cel
// greșit este intotdeauna cel care s-a tiparit.
//
// CELE CINCI ETICHETE SUNT REFOLOSITE CUVANT CU CUVANT de la blocul Facturare:
// Denumirea firmei, IDNO, Adresa, Banca, IBAN. Nu s-au inventat altele pentru
// aceleasi campuri, fiindca doua nume romanesti pentru acelasi lucru sunt doua
// lucruri de invatat. Cele trei noi primesc etichete din acelasi registru: Cod TVA,
// Telefon, Email, ultimele doua exact cele pe care le scriu deja formularele de
// client si de contact.
//
// COTA TVA SI CODUL TVA SUNT DOUA LUCRURI, si eticheta nu are voie sa le
// amestece. Cota (Cota TVA implicită, un procent pe o linie de factura) rămâne in
// blocul Facturare si nu apare aici deloc. Codul (Cod TVA, numarul de inregistrare
// ca platitor de TVA) este aici, si isi poarta pe ecran propria propoziție care
// spune amandoua lucrurile: ca nu este cota, si ca nu este IDNO.
//
// DE CE CELE CINCI SE VAD SI IN BLOCUL FACTURARE. Cazul 2 din
// tests/e2e/facturare-settings.spec.ts le completeaza acolo, apasa butonul de acolo
// si le citeste inapoi, iar acest card nu are voie sa atinga acel test. A le muta
// ar fi insemnat sa mut si proba ca sa se potriveasca unei preferinte, ceea ce
// proiectul refuza. Deci se vad in doua locuri, pe UN SINGUR RAND, si de aceea nu
// se pot contrazice.
//
// FIECARE FORMA SCRIE NUMAI CAMPURILE EI. Formularul acesta cheama
// saveCompanyDetails, care nu atinge niciodata prefixul seriei, anul din numar sau
// cota TVA. Cerinta este chiar a raportului: "each form saves only its own fields
// and never writes back a blank over the other's".
//
// UN CAMP GOL SE VEDE GOL. Nicio cratima, niciun text inventat si NICIUN
// placeholder: un placeholder in caseta IDNO ar arata un numar pe care nimeni nu l-a
// scris, iar o jumatate necompletata a datelor firmei trebuie sa se vada
// necompletata.
//
// canWrite ESTE O A DOUA LINIE SI NU PRIMA, ca la FacturareSettings: ruta /setari
// este a proprietarului in lib/routes.ts, deci proxy.ts intoarce ecranul 403 unui
// operator inainte de randare. Se pastreaza fiindca proprietatea este adevarata
// despre component si nu despre ruta, iar politica invoice_settings_owner_update
// refuza oricum scrierea in baza.
//
// NU EXISTA LOGO AICI. Raportul recomanda sa astepte pana exista un document pe
// care sa fie tiparit, iar documentul de factura nu este construit.
//
// PE TELEFON (sub 768px) campurile stau unul sub altul si fiecare tinta are 44px;
// peste 768px nimic nu se schimba. Numele de clase se importa din
// components/ui/phone.ts si NU se scriu local: asta a curatat obiectivul G56,
// cardul P3-100.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { PHONE_STACK, PHONE_TAP } from "@/components/ui/phone";
import type { InvoiceSettings } from "@/lib/data/facturare-types";
import { saveCompanyDetails } from "@/lib/data/facturare-actions";

/** CE SCRIE ECRANUL LANGA CODUL TVA, si scrie asta fiindca trei numere se pot
 *  amesteca: IDNO este numarul de inregistrare al firmei, codul TVA este numarul
 *  primit la inregistrarea ca platitor de TVA, iar cota TVA este un procent pe o
 *  linie de factura si sta in secțiunea Facturare.
 *
 *  NU SE EXPORTA, si tests/e2e/setari-date-firma.spec.ts pastreaza propria copie a
 *  propozitiei, exact ca facturare-settings.spec cu VAT_NOTE. Un spec care ar importa
 *  din acest fisier ar trage dupa el actiunile, iar acelea trag lib/supabase/server,
 *  care importa "server-only" si arunca in afara unei randari de server. */
const VAT_CODE_NOTE =
  "Codul de înregistrare ca plătitor de TVA. Nu este IDNO și nu este cota de pe factură.";

export function DateFirmaSettings({
  settings,
  canWrite,
}: {
  /** Null cand migratia 0063 nu este inca aplicata pe baza catre care arata
   *  aplicatia, sau cand cel care se uita nu are voie sa citeasca randul. In
   *  amandoua cazurile secțiunea spune romaneste ce se intampla si nu cade. */
  settings: InvoiceSettings | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(settings?.issuerName ?? "");
  const [fiscalCode, setFiscalCode] = React.useState(settings?.issuerFiscalCode ?? "");
  const [address, setAddress] = React.useState(settings?.issuerAddress ?? "");
  const [bank, setBank] = React.useState(settings?.issuerBank ?? "");
  const [iban, setIban] = React.useState(settings?.issuerIban ?? "");
  const [vatCode, setVatCode] = React.useState(settings?.issuerVatCode ?? "");
  const [phone, setPhone] = React.useState(settings?.issuerPhone ?? "");
  const [email, setEmail] = React.useState(settings?.issuerEmail ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  // DOUA FORME SCRIU UN SINGUR RAND, deci fiecare trebuie sa afle cand cealalta a
  // scris. Amandoua cheama router.refresh() dupa o salvare reusita, ceea ce reface
  // componenta de server si trimite valorile noi in jos; acest efect le pune in
  // starea formularului. Fara el, formularul rămas neatins ar continua sa tina
  // valoarea veche si urmatoarea lui salvare ar sterge peste ce s-a salvat aici.
  // saved si error NU se sting de aici: propoziția "Datele au fost salvate" trebuie
  // sa rămână pe ecran dupa reimprospatarea pe care chiar ea a declansat-o.
  const serverName = settings?.issuerName ?? "";
  const serverFiscalCode = settings?.issuerFiscalCode ?? "";
  const serverAddress = settings?.issuerAddress ?? "";
  const serverBank = settings?.issuerBank ?? "";
  const serverIban = settings?.issuerIban ?? "";
  const serverVatCode = settings?.issuerVatCode ?? "";
  const serverPhone = settings?.issuerPhone ?? "";
  const serverEmail = settings?.issuerEmail ?? "";
  React.useEffect(() => {
    setName(serverName);
    setFiscalCode(serverFiscalCode);
    setAddress(serverAddress);
    setBank(serverBank);
    setIban(serverIban);
    setVatCode(serverVatCode);
    setPhone(serverPhone);
    setEmail(serverEmail);
  }, [
    serverName,
    serverFiscalCode,
    serverAddress,
    serverBank,
    serverIban,
    serverVatCode,
    serverPhone,
    serverEmail,
  ]);

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    const result = await saveCompanyDetails({
      issuerName: name,
      issuerFiscalCode: fiscalCode,
      issuerAddress: address,
      issuerBank: bank,
      issuerIban: iban,
      issuerVatCode: vatCode,
      issuerPhone: phone,
      issuerEmail: email,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const contactReady = settings?.companyContactReady ?? false;

  // Card nu primeste data-testid (components/ui/primitives.tsx), deci blocul este
  // invelit intr-o secțiune care il poarta, exact ca UnitSettings, FacturareSettings
  // si UserSettings.
  return (
    <section data-testid="settings-date-firma">
      <Card className="mb-5">
        <CardHeader
          title="Date firmă"
          hint="Datele Rapid Construct, într-un singur loc. Aceleași date apar pe factură."
        />

        {settings === null ? (
          <p
            className="px-5 py-10 text-center text-[13px] text-rc-muted"
            data-testid="date-firma-inactive"
          >
            Datele firmei nu sunt încă active pe această bază de date. Ele apar aici imediat ce
            structura de facturare este aplicată.
          </p>
        ) : (
          <form onSubmit={onSave} className="px-5 py-4">
            <div className={`grid gap-4 md:grid-cols-2 ${PHONE_STACK}`}>
              {/* CELE CINCI ETICHETE SUNT CELE DIN BLOCUL FACTURARE, cuvant cu
                  cuvant. Niciun nume nou pentru un camp care are deja unul. */}
              <Field label="Denumirea firmei" className="min-w-0">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canWrite}
                  data-testid="date-firma-name"
                />
              </Field>
              <Field label="IDNO" className="min-w-0">
                <Input
                  value={fiscalCode}
                  onChange={(e) => setFiscalCode(e.target.value)}
                  disabled={!canWrite}
                  data-testid="date-firma-fiscal-code"
                />
              </Field>
              <Field label="Adresa" className="min-w-0">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={!canWrite}
                  data-testid="date-firma-address"
                />
              </Field>
              <Field label="Banca" className="min-w-0">
                <Input
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  disabled={!canWrite}
                  data-testid="date-firma-bank"
                />
              </Field>
              <Field label="IBAN" className="min-w-0">
                <Input
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  disabled={!canWrite}
                  data-testid="date-firma-iban"
                />
              </Field>
            </div>

            <p className="mt-5 mb-2 text-[12.5px] font-semibold text-rc-black">
              Cod TVA, telefon și email
            </p>

            {contactReady ? (
              <div className={`grid gap-4 md:grid-cols-2 ${PHONE_STACK}`}>
                <Field label="Cod TVA" className="min-w-0">
                  <Input
                    value={vatCode}
                    onChange={(e) => setVatCode(e.target.value)}
                    disabled={!canWrite}
                    data-testid="date-firma-vat-code"
                  />
                  {/* Nota sta aici si nu in hint-ul campului, ca sa aiba propriul
                      data-testid: spec-ul o citeste cuvant cu cuvant, exact ca nota
                      de langa cota TVA din blocul Facturare. */}
                  <span
                    className="mt-1 block text-[12px] text-rc-muted"
                    data-testid="date-firma-vat-code-note"
                  >
                    {VAT_CODE_NOTE}
                  </span>
                </Field>
                <Field label="Telefon" className="min-w-0">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!canWrite}
                    inputMode="tel"
                    data-testid="date-firma-phone"
                  />
                </Field>
                <Field label="Email" className="min-w-0">
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!canWrite}
                    inputMode="email"
                    data-testid="date-firma-email"
                  />
                </Field>
              </div>
            ) : (
              // FEREASTRA DINTRE FUZIUNE SI APLICARE. Migratia 0066 ajunge in
              // productie in aproximativ doua minute de la fuziune, iar codul pleaca
              // din acelasi push. Pana atunci cele cinci campuri de sus merg exact ca
              // azi si aici se scrie o propoziție, nu niste casete care nu pot salva.
              <p className="text-[13px] text-rc-muted" data-testid="date-firma-contact-pending">
                Codul TVA, telefonul și emailul apar aici imediat ce structura lor este aplicată
                pe această bază de date. Restul datelor firmei se pot completa acum.
              </p>
            )}

            {error ? (
              <p
                role="alert"
                data-testid="date-firma-error"
                className="mt-4 rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
              >
                {error}
              </p>
            ) : null}

            {saved ? (
              <p className="mt-4 text-[12.5px] text-rc-muted" data-testid="date-firma-done">
                Datele firmei au fost salvate.
              </p>
            ) : null}

            {canWrite ? (
              <div className="mt-4 flex max-md:flex-col max-md:items-stretch">
                <Button
                  type="submit"
                  disabled={pending}
                  data-testid="date-firma-save"
                  className={PHONE_TAP}
                >
                  {pending ? "Se salvează..." : "Salvează datele firmei"}
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-[12.5px] text-rc-muted" data-testid="date-firma-read-only">
                Doar administratorul poate modifica datele firmei.
              </p>
            )}
          </form>
        )}
      </Card>
    </section>
  );
}
