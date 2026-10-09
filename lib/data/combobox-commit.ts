// Ce face lista derulanta cu textul tastat cand operatorul pleaca din camp.
//
// Logica sta aici, nu in componenta, ca sa poata fi probata fara browser.
//
// P3-177: cand mai mult de o optiune se potriveste exact pe eticheta si lista
// cere asta, nu se alege nimic. Cu Enter lista ramane deschisa, ca operatorul sa
// aleaga. Un clic in afara o inchide, fara nicio alegere: altfel ramanea deschisa
// pana la Escape si operatorul nu putea da clic in alta parte.

export type CommitDecision = {
  /** Valoarea de trimis la onChange, sau null daca nu se alege nimic. */
  select: string | null;
  /** True cand lista se inchide si textul tastat se goleste. */
  close: boolean;
};

export function decideCommit(args: {
  options: { value: string; label: string }[];
  typed: string;
  creatable: boolean;
  dontSelectOnMultipleExactMatches: boolean;
  fromOutsideClick: boolean;
}): CommitDecision {
  const typed = args.typed.trim();
  if (!typed) return { select: null, close: true };
  const exactMatches = args.options.filter((o) => o.label === typed);
  if (exactMatches.length > 1 && args.dontSelectOnMultipleExactMatches) {
    return { select: null, close: args.fromOutsideClick };
  }
  if (exactMatches.length > 0) return { select: exactMatches[0].value, close: true };
  if (args.creatable) return { select: typed, close: true };
  return { select: null, close: true };
}
