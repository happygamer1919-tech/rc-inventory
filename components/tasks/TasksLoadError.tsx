// Anuntul care ia locul sectiunii de sarcini cand citirea lor a esuat (P3-276).
// Restul paginii se desena si inainte: o citire cazuta nu are voie sa duca dupa ea
// lista de sunat sau fisa clientului, deci eroarea se opreste in sectiunea ei.

export function TasksLoadError() {
  return (
    <p
      role="alert"
      data-testid="tasks-load-error"
      className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
    >
      Sarcinile nu s-au putut încărca acum. Restul paginii funcționează; reîncarcă pagina peste puțin timp.
    </p>
  );
}
