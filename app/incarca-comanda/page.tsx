"use client";

// RC-04 Incarca comanda. Ecranul care vinde preview-ul.
//
// Nu se citeste nimic din fisier: nu exista OCR, nu exista extragere si nimic
// nu pleaca spre vreun server. Fisierul este acceptat, ruleaza o animatie de
// procesare pe etape vizibile ca sa se citeasca drept lucru facut, iar apoi
// apare fisa de verificare deja completata din datele RC-02.

import * as React from "react";
import Link from "next/link";
import { Button, Card, Chip, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { OrderForm, newLine } from "@/components/orders/OrderForm";
import type { OrderFormInitial } from "@/components/orders/OrderForm";
import { FIXTURE_DOCUMENTS, fixtureForFileName, formatDate } from "@/lib/mock";
import type { FixtureDocument, InboundOrder } from "@/lib/mock";

type Phase = "idle" | "processing" | "review" | "done";

/** Etapele procesarii simulate. Duratele sunt alese ca sa se simta ca lucru
 *  facut fara sa plictiseasca: circa cinci secunde in total. */
const STAGES = [
  { label: "Se încarcă documentul", detail: "Verificare format și dimensiune", ms: 700 },
  { label: "Se recunoaște furnizorul", detail: "Antet, cod TVA și date de contact", ms: 1000 },
  { label: "Se extrag pozițiile din tabel", detail: "Articole, cantități și prețuri unitare", ms: 1500 },
  { label: "Se potrivesc produsele cu catalogul", detail: "Corespondență după cod și descriere", ms: 1200 },
  { label: "Se verifică unitățile de măsură", detail: "Fiecare produs are unitatea lui fixă", ms: 800 },
];

function toInitial(fx: FixtureDocument): OrderFormInitial {
  const e = fx.extracted;
  return {
    supplierId: e.supplierId,
    documentNumber: e.documentNumber,
    currency: e.currency,
    orderedAt: e.orderedAt,
    expectedAt: e.expectedAt,
    paymentTerms: e.paymentTerms,
    incoterms: e.incoterms,
    lines: e.lines.map((l) => ({
      ...newLine(),
      productId: l.productId,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      supplierArticle: l.supplierArticle,
      supplierDescription: l.supplierDescription,
    })),
  };
}

export default function UploadOrderPage() {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [fileName, setFileName] = React.useState("");
  const [fixture, setFixture] = React.useState<FixtureDocument | null>(null);
  const [stage, setStage] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [created, setCreated] = React.useState<InboundOrder | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function start(name: string) {
    setFileName(name);
    setFixture(fixtureForFileName(name));
    setStage(0);
    setPhase("processing");
  }

  // Avanseaza prin etape pe cronometru, apoi trece la verificare.
  React.useEffect(() => {
    if (phase !== "processing") return;
    if (stage >= STAGES.length) {
      const t = setTimeout(() => setPhase("review"), 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStage((s) => s + 1), STAGES[stage].ms);
    return () => clearTimeout(t);
  }, [phase, stage]);

  function reset() {
    setPhase("idle");
    setFileName("");
    setFixture(null);
    setStage(0);
    setCreated(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  /* ------------------------------------------------------------- confirmat -- */
  if (phase === "done" && created) {
    return (
      <>
        <PageHeader title="Comandă confirmată" lead="Comanda a intrat în lista de intrări." />
        <Card className="max-w-[720px]">
          <div className="px-7 py-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rc-ok-soft text-rc-ok grid place-items-center text-[22px]">
              ✓
            </div>
            <p className="mt-4 text-[17px] font-bold text-rc-black">{created.reference}</p>
            <p className="text-[13.5px] text-rc-muted mt-1.5">
              Creată din documentul {fileName || "încărcat"}, cu {created.lines.length} poziții.
              Livrare estimată {formatDate(created.expectedAt)}.
            </p>
            <div className="mt-4 flex justify-center">
              <Chip tone="warn">În așteptare</Chip>
            </div>
            <p className="text-[12.5px] text-rc-muted-2 mt-4 max-w-[52ch] mx-auto leading-relaxed">
              Loturile nu există încă. Se creează în momentul în care comanda este marcată drept
              recepționată, în ecranul de comenzi.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <Link href="/comenzi">
                <Button>Vezi comanda în listă</Button>
              </Link>
              <Button variant="secondary" onClick={reset}>
                Încarcă altă comandă
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  /* -------------------------------------------------------------- verificare -- */
  if (phase === "review" && fixture) {
    return (
      <>
        <PageHeader
          title="Verifică și confirmă"
          lead="Am citit documentul și am completat fișa. Corectează orice câmp înainte de confirmare."
          actions={
            <Button variant="secondary" onClick={reset}>
              Renunță
            </Button>
          }
        />
        <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-rc-line bg-rc-white px-5 py-3.5">
          <span className="grid place-items-center w-9 h-9 rounded-[9px] bg-rc-orange-soft text-rc-orange-deep shrink-0">
            <Icon name="upload" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-rc-black truncate">{fileName}</p>
            <p className="text-[12px] text-rc-muted mt-0.5">
              {fixture.extracted.supplierNameOnDocument} · document{" "}
              {fixture.extracted.documentNumber} · {fixture.extracted.lines.length} poziții găsite
            </p>
          </div>
          <a
            href={fixture.filePath}
            target="_blank"
            rel="noreferrer"
            className="text-[12.5px] font-semibold text-rc-orange-deep hover:underline shrink-0"
          >
            Deschide documentul
          </a>
        </div>

        <OrderForm
          initial={toInitial(fixture)}
          mode="review"
          onConfirmed={(o) => {
            setCreated(o);
            setPhase("done");
          }}
        />
      </>
    );
  }

  /* --------------------------------------------------------------- procesare -- */
  if (phase === "processing") {
    return (
      <>
        <PageHeader title="Se procesează documentul" lead="Durează câteva secunde." />
        <Card className="max-w-[720px]">
          <div className="px-7 py-7">
            <div className="flex items-center gap-3 pb-5 border-b border-rc-line">
              <span className="grid place-items-center w-10 h-10 rounded-[10px] bg-rc-orange-soft text-rc-orange-deep shrink-0">
                <Icon name="upload" className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-rc-black truncate">{fileName}</p>
                <p className="text-[12px] text-rc-muted mt-0.5">Se analizează conținutul</p>
              </div>
            </div>

            <ul className="pt-5 space-y-3.5">
              {STAGES.map((s, i) => {
                const state = i < stage ? "done" : i === stage ? "active" : "waiting";
                return (
                  <li key={s.label} className="flex items-start gap-3">
                    <span
                      className={[
                        "mt-0.5 grid place-items-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 transition-colors",
                        state === "done" ? "bg-rc-ok text-white" : "",
                        state === "active" ? "bg-rc-orange text-white" : "",
                        state === "waiting" ? "bg-rc-paper text-rc-muted-2 border border-rc-line" : "",
                      ].join(" ")}
                    >
                      {state === "done" ? "✓" : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={[
                          "text-[13.5px] transition-colors",
                          state === "waiting" ? "text-rc-muted-2" : "font-semibold text-rc-black",
                        ].join(" ")}
                      >
                        {s.label}
                        {state === "active" ? <span className="rc-dots" /> : null}
                      </p>
                      <p className="text-[12px] text-rc-muted mt-0.5">{s.detail}</p>
                      {state === "active" ? (
                        <div className="mt-2 h-[3px] rounded-full bg-rc-line overflow-hidden">
                          <div
                            className="h-full bg-rc-orange rc-progress"
                            style={{ animationDuration: `${s.ms}ms` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      </>
    );
  }

  /* ------------------------------------------------------------------ start -- */
  return (
    <>
      <PageHeader
        title="Încarcă comandă"
        lead="Trage aici confirmarea primită de la furnizor. Sistemul o citește, apoi tu verifici și confirmi."
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          start(f ? f.name : "confirmare-comanda.pdf");
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={[
          "cursor-pointer rounded-[16px] border-2 border-dashed px-8 py-16 text-center transition-colors",
          dragging
            ? "border-rc-orange bg-rc-orange/10"
            : "border-white/15 bg-rc-ink hover:border-rc-orange/50 hover:bg-white/[0.03]",
        ].join(" ")}
      >
        <div
          className={[
            "mx-auto w-14 h-14 rounded-[14px] grid place-items-center transition-colors",
            dragging ? "bg-rc-orange text-white" : "bg-white/5 text-rc-orange",
          ].join(" ")}
        >
          <Icon name="upload" className="w-7 h-7" />
        </div>
        <p className="mt-4 text-[17px] font-semibold text-white">
          {dragging ? "Dă drumul fișierului aici" : "Trage documentul aici"}
        </p>
        <p className="mt-1.5 text-[13.5px] text-rc-muted-2">
          sau apasă pentru a alege un fișier de pe calculator
        </p>
        <p className="mt-4 text-[12px] text-rc-muted">PDF, JPG sau PNG</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) start(f.name);
          }}
        />
      </div>

      <Card className="mt-4">
        <div className="px-5 py-4 border-b border-rc-line">
          <h2 className="text-[15px] font-semibold text-rc-black">Documente de probă</h2>
          <p className="text-[12.5px] text-rc-muted mt-0.5">
            Două confirmări reale de furnizor, pentru demonstrație. Apasă pe una ca să o treci prin flux.
          </p>
        </div>
        <ul>
          {FIXTURE_DOCUMENTS.map((f, i) => (
            <li
              key={f.id}
              className={[
                "flex items-center gap-4 px-5 py-3.5",
                i < FIXTURE_DOCUMENTS.length - 1 ? "border-b border-rc-line" : "",
              ].join(" ")}
            >
              <span className="grid place-items-center w-9 h-11 rounded-[7px] bg-rc-danger-soft text-rc-danger text-[10px] font-bold shrink-0">
                PDF
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-rc-black truncate">{f.fileName}</p>
                <p className="text-[12px] text-rc-muted mt-0.5">
                  {f.extracted.supplierNameOnDocument} · {f.extracted.currency} ·{" "}
                  {f.extracted.lines.length} poziții · {f.sizeLabel}
                </p>
              </div>
              <a
                href={f.filePath}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[12.5px] font-semibold text-rc-muted hover:text-rc-black shrink-0"
              >
                Vezi PDF
              </a>
              <Button size="sm" onClick={() => start(f.fileName)}>
                Folosește acest document
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
