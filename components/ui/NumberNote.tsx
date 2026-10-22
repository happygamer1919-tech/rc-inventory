// P3-332: ce spune ecranul sub o casuta de numar. Fie motivul refuzului (rosu), fie ce a citit
// ("Citit: 2,50 lei"), ca o virgula gresita sa se vada inainte de salvare. Aceeasi marcare ca
// pe iesirea pentru client (OutboundDirectClientForm), pentru toate formularele.

export function NumberNote({
  problem,
  read,
  testId,
}: {
  problem: string | null;
  read?: string | null;
  testId: string;
}) {
  if (problem !== null) {
    return (
      <p role="alert" className="mt-1 text-[12px] text-rc-danger" data-testid={`${testId}-error`}>
        {problem}
      </p>
    );
  }
  if (read) {
    return (
      <p className="mt-1 text-[12px] text-rc-muted-2" data-testid={`${testId}-read`}>
        {read}
      </p>
    );
  }
  return null;
}
