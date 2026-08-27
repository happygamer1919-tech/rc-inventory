"use client";

// P2-11. Granita de eroare a RADACINII.
//
// app/error.tsx prinde tot ce cade INAUNTRUL layout-ului radacina. Acest fisier
// prinde ce cade IN layout-ul radacina insusi, unde nu mai exista nici html nici
// body, motiv pentru care le randeaza el.
//
// Nu ar trebui sa se vada niciodata. Exista fiindca alternativa lui nu este un
// alt ecran romanesc, ci pagina de eroare implicita a lui Next, in engleza.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ro">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          background: "#14110f",
          color: "#f5f3f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <h1 style={{ fontSize: "20px", margin: 0 }} data-testid="global-error">
          Aplicația nu a putut porni ecranul
        </h1>
        <p style={{ fontSize: "14px", color: "#a8a29c", maxWidth: "44ch", margin: 0 }}>
          Încearcă din nou. Dacă se repetă, spune-i administratorului codul de mai jos.
        </p>
        <p style={{ fontSize: "12px", color: "#a8a29c", fontFamily: "monospace", margin: 0 }}>
          {error.digest ?? "fără cod"}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "8px",
            border: 0,
            borderRadius: "8px",
            padding: "10px 16px",
            fontSize: "14px",
            fontWeight: 600,
            background: "#f07422",
            color: "#14110f",
            cursor: "pointer",
          }}
        >
          Încearcă din nou
        </button>
      </body>
    </html>
  );
}
