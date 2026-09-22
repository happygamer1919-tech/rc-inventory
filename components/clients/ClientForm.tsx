"use client";

// Formularul de client, cardul P3-06.
//
// ACELASI PANOU LATERAL CA LA PRODUS, deliberat. P3-06 spune ca limbajul vizual
// existent se reutilizeaza si nu se inlocuieste: un al doilea fel de formular ar
// fi o a doua convenție de invatat, pentru acelasi lucru.
//
// DETALIUL ESTE O RUTA, FORMULARUL ESTE UN PANOU, si cele doua nu se contrazic.
// Ruta poarta file in cardul urmator si un panou lateral nu tine cinci file la o
// latime citibila; formularul are opt campuri si nu merita o pagina.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { DateField, useInvalidDates } from "@/components/ui/DateField";
import { PHONE_CHECK, PHONE_CLOSE, PHONE_SHEET, PHONE_STACK } from "@/components/ui/phone";
import { createClientRecord, updateClientRecord } from "@/lib/data/client-actions";
import {
  CLIENT_SOURCES,
  CLIENT_SOURCE_LABEL,
  CLIENT_STAGES,
  CLIENT_STAGE_LABEL,
  CLIENT_TYPE_LABEL,
  type ClientDetail,
  type ClientOwnerChoice,
} from "@/lib/data/clients-types";

export function ClientForm({
  client,
  stageAvailable,
  owners,
  nextActionAvailable = false,
  onClose,
  onSaved,
}: {
  client?: ClientDetail;
  /** P3-43. Fals cat timp coloana de etapa nu exista pe baza. Atunci formularul
   *  nu ofera etapa si nu o trimite, exact ca inainte de card. */
  stageAvailable: boolean;
  /** P3-48. Responsabilii, din listClientOwnerChoices. Lipsa inseamna ca
   *  hasClientLeaduri nu a raspuns da: atunci formularul nu ofera Sursă, Interes si
   *  Responsabil si nu le trimite. */
  owners?: ClientOwnerChoice[];
  /** P3-89. Adevarat numai cand hasClientNextAction a raspuns da, citit de pe
   *  client. Fals inseamna ca formularul nu ofera Următorul pas si nu il trimite. */
  nextActionAvailable?: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const editing = client !== undefined;

  const [name, setName] = React.useState(client?.name ?? "");
  const [type, setType] = React.useState<string>(client?.type ?? "company");
  const [fiscalCode, setFiscalCode] = React.useState(client?.fiscalCode ?? "");
  const [address, setAddress] = React.useState(client?.address ?? "");
  const [phone, setPhone] = React.useState(client?.phone ?? "");
  const [email, setEmail] = React.useState(client?.email ?? "");
  const [notes, setNotes] = React.useState(client?.notes ?? "");
  const [active, setActive] = React.useState(client?.active ?? true);
  const [stage, setStage] = React.useState<string>(client?.stage ?? "cold");
  const [followUpDate, setFollowUpDate] = React.useState(client?.followUpDate ?? "");
  const [source, setSource] = React.useState<string>(client?.source ?? "");
  const [interest, setInterest] = React.useState(client?.interest ?? "");
  const [ownerId, setOwnerId] = React.useState(client?.ownerId ?? "");
  const [nextActionAt, setNextActionAt] = React.useState(client?.nextActionAt ?? "");
  const [nextAction, setNextAction] = React.useState(client?.nextAction ?? "");

  // Un responsabil al carui profil a fost dezactivat nu mai este in lista, dar
  // ramane responsabilul clientului: optiunea lui se pastreaza, altfel selectorul
  // ar arata Nealocat pentru un client care are responsabil.
  const ownerOptions =
    owners && client?.ownerId && !owners.some((o) => o.id === client.ownerId)
      ? [...owners, { id: client.ownerId, fullName: client.ownerName ?? "Responsabil inactiv" }]
      : (owners ?? []);

  // P3-89. La De reluat exista o singura casuta de data, cea de reluare.
  const followUpBox = stageAvailable && stage === "follow_up";

  // P3-92, constatarea F4. Cat timp o casuta de data arata mesajul rosu, Salvează
  // este oprit: altfel o data tastata pe jumatate pleaca spre server ca sir gol si
  // sterge data stocata fara niciun mesaj.
  const { anyInvalid: dateInvalid, mark } = useInvalidDates();

  // P3-92, constatarea F3. CASUTA PASULUI NU PASTREAZA OGLINDA DE RELUAT.
  //
  // La De reluat cele doua date sunt o singura casuta ("setting one sets both",
  // P3-89), deci un lead salvat acolo are aceeasi data in next_action_at. Cand
  // etapa pleaca din De reluat, casuta de reluare dispare si apare cea a pasului,
  // care ar arata tocmai acea oglinda: o data pe care salvarea o sterge oricum,
  // fiindca proprietarul a hotarat ca plecarea din De reluat le incheie pe amandoua.
  // O aratam goala in aceeasi clipa in care etapa se schimba, ca operatorul sa vada
  // ce se salveaza si sa poata scrie un pas adevarat daca vrea unul.
  const mirroredStep =
    client?.stage === "follow_up" &&
    (client?.nextActionAt ?? "") !== "" &&
    client?.nextActionAt === client?.followUpDate
      ? client.nextActionAt
      : null;

  React.useEffect(() => {
    if (mirroredStep === null || stage === "follow_up") return;
    setNextActionAt((prev) => (prev === mirroredStep ? "" : prev));
  }, [mirroredStep, stage]);

  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | undefined>(undefined);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // P3-92. A doua plasa sub butonul oprit: tasta Enter intr-un camp de text
    // trimite formularul, si un browser care nu tine cont de butonul dezactivat ar
    // trece pe langa singura oprire.
    if (dateInvalid) return;
    setError(null);
    setErrorField(undefined);
    setPending(true);

    const input = {
      name,
      type,
      fiscalCode,
      address,
      phone,
      email,
      notes,
      active,
      // P3-88. DATA PLEACA NUMAI LA DE RELUAT. La orice alta etapa campul este
      // ascuns, iar starea lui tine inca data stocata: trimisa, ar fi pastrat-o pe
      // nevazute la plecarea din De reluat. Sirul vid ajunge null, iar functia din
      // 0057 sterge data cand etapa pleaca din De reluat si o lasa neatinsa altfel.
      ...(stageAvailable
        ? { stage, followUpDate: stage === "follow_up" ? followUpDate : "" }
        : {}),
      // P3-48. NUMAI CE S-A SCHIMBAT. Un camp netrimis inseamna "nu atinge" pentru
      // validateLeaduri, deci o modificare fara legatura cu cele trei nu le rescrie.
      ...(owners && source !== (client?.source ?? "") ? { source } : {}),
      ...(owners && interest !== (client?.interest ?? "") ? { interest } : {}),
      ...(owners && ownerId !== (client?.ownerId ?? "") ? { ownerId } : {}),
      // P3-89. URMATORUL PAS, NUMAI CE S-A SCHIMBAT, ca mai sus. La De reluat
      // formularul nu are o a doua casuta de data si nu trimite data pasului:
      // actiunea scrie data de reluare in ambele coloane ("setting one sets both").
      ...(nextActionAvailable &&
      !followUpBox &&
      nextActionAt !== (client?.nextActionAt ?? "")
        ? { nextActionAt }
        : {}),
      ...(nextActionAvailable && nextAction !== (client?.nextAction ?? "") ? { nextAction } : {}),
    };
    const result = editing
      ? await updateClientRecord(client!.id, input)
      : await createClientRecord(input);

    if (!result.ok) {
      setError(result.message);
      setErrorField(result.field);
      setPending(false);
      return;
    }

    router.refresh();
    if (onSaved) onSaved(result.value.id);
    else onClose();
  }

  const fieldClass = (field: string) =>
    errorField === field ? "border-rc-danger" : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside
        className={`relative w-[520px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl ${PHONE_SHEET}`}
        data-testid="client-form"
      >
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-rc-black leading-snug">
              {editing ? "Modifică clientul" : "Client nou"}
            </h2>
            <p className="text-[12.5px] text-rc-muted mt-1">
              IDNO-ul este ce deosebește două firme cu aceeași denumire.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className={`shrink-0 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-paper hover:text-rc-black transition-colors ${PHONE_CLOSE}`}
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="px-6 py-5 space-y-4">
          <Field label="Denumire" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass("name")}
              data-testid="field-client-name"
            />
          </Field>

          <div className={`grid grid-cols-2 gap-4 ${PHONE_STACK}`}>
            <Field label="Tip" required>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={fieldClass("type")}
                data-testid="field-client-type"
              >
                <option value="company">{CLIENT_TYPE_LABEL.company}</option>
                <option value="individual">{CLIENT_TYPE_LABEL.individual}</option>
              </Select>
            </Field>

            <Field
              label="IDNO"
              hint="Companiile au IDNO, persoanele fizice nu."
            >
              <Input
                value={fiscalCode}
                onChange={(e) => setFiscalCode(e.target.value)}
                className={fieldClass("fiscalCode")}
                data-testid="field-client-fiscal"
              />
            </Field>
          </div>

          {stageAvailable ? (
            // P3-43. ORICE ETAPA SE POATE ALEGE DIN ORICARE ALTA: nu este o
            // masina de stari, la fel ca starea proiectului din 0016. Optiunile
            // vin din CLIENT_STAGES, deci ordinea de aici este ordinea din baza.
            <div className={`grid grid-cols-2 gap-4 ${PHONE_STACK}`}>
              <Field label="Etapă">
                <Select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className={fieldClass("stage")}
                  data-testid="field-client-stage"
                >
                  {CLIENT_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {CLIENT_STAGE_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>

              {stage === "follow_up" ? (
                <Field label="Data de reluare" required>
                  <DateField
                    value={followUpDate}
                    onChange={setFollowUpDate}
                    onValidityChange={mark("followUpDate")}
                    className={fieldClass("followUpDate")}
                    testId="field-client-follow-up"
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          {nextActionAvailable ? (
            // P3-89. URMATORUL PAS, CHIAR SUB ETAPA. La De reluat data lui este data
            // de reluare de mai sus, deci aici ramane numai textul.
            <div
              className={`grid ${followUpBox ? "grid-cols-1" : "grid-cols-2"} gap-4 ${PHONE_STACK}`}
              data-testid="client-next-action-fields"
            >
              {followUpBox ? null : (
                <Field label="Data următorului pas">
                  <DateField
                    value={nextActionAt}
                    onChange={setNextActionAt}
                    onValidityChange={mark("nextActionAt")}
                    className={fieldClass("nextActionAt")}
                    testId="field-client-next-action-at"
                  />
                </Field>
              )}
              <Field
                label="Următorul pas"
                hint={
                  followUpBox
                    ? "Data pasului este data de reluare."
                    : "Un rând, de exemplu: trimit oferta."
                }
              >
                <Input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  className={fieldClass("nextAction")}
                  data-testid="field-client-next-action"
                />
              </Field>
            </div>
          ) : null}

          {owners ? (
            // P3-48. ACELEASI CAMPURI SI ACELEASI OPTIUNI CA IN FORMULARUL DE LEAD:
            // sursele din CLIENT_SOURCES, responsabilii din listClientOwnerChoices.
            <>
              <div className={`grid grid-cols-2 gap-4 ${PHONE_STACK}`}>
                <Field label="Sursă">
                  <Select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className={fieldClass("source")}
                    data-testid="field-client-source"
                  >
                    <option value="">Nespecificată</option>
                    {CLIENT_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {CLIENT_SOURCE_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Responsabil">
                  <Select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className={fieldClass("ownerId")}
                    data-testid="field-client-owner"
                  >
                    <option value="">Nealocat</option>
                    {ownerOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.fullName}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Interes" hint="Ce își dorește, în cuvintele lui.">
                <Input
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  data-testid="field-client-interest"
                />
              </Field>
            </>
          ) : null}

          <div className={`grid grid-cols-2 gap-4 ${PHONE_STACK}`}>
            <Field label="Telefon">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="field-client-phone"
              />
            </Field>
            <Field label="Email">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="field-client-email"
              />
            </Field>
          </div>

          <Field label="Adresă">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              data-testid="field-client-address"
            />
          </Field>

          <Field label="Note">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="field-client-notes"
            />
          </Field>

          {editing ? (
            <label className={`flex items-center gap-2.5 text-[13.5px] text-rc-black ${PHONE_CHECK}`}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                data-testid="field-client-active"
                className="w-4 h-4 accent-rc-orange"
              />
              {/* DEZACTIVAREA NU ESTE STERGERE. Migratia 0013 nu are politica de
                  delete pentru niciun rol: un client la care se leaga proiecte si
                  iesiri nu poate sa dispara fara sa faca istoricul de necitit. */}
              Activ, adică apare în liste și în selectoare
            </label>
          ) : null}

          {error ? (
            <p
              role="alert"
              data-testid="form-error"
              className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit" disabled={pending || dateInvalid} data-testid="client-submit">
              {pending ? "Se salvează..." : "Salvează"}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
