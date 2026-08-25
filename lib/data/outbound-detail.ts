"use server";

// Detaliul unei iesiri, incarcat la deschiderea panoului.

import { getOutboundIssue } from "./outbound";
import { getSessionUser } from "@/lib/supabase/server";
import type { OutboundDetail } from "./outbound-types";

export async function loadOutboundDetail(issueId: string): Promise<OutboundDetail> {
  // O server action este un capat de retea, nu o functie interna.
  const user = await getSessionUser();
  if (!user) return { issue: null };

  const issue = await getOutboundIssue(issueId);
  return { issue };
}
