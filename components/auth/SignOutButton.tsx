"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LOGIN_PATH } from "@/lib/routes";

// Iesirea din cont. Fara ea, singura cale de a schimba contul este stergerea
// cookie-urilor din browser, iar testul care verifica refuzul rolului
// account_manager ar avea nevoie de un al doilea profil de browser.
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace(LOGIN_PATH);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      data-testid="sign-out"
      className="ml-1 rounded-md border border-white/15 px-2.5 py-1 text-[12px] text-rc-muted-2 transition-colors hover:border-rc-orange hover:text-white disabled:opacity-60"
    >
      {pending ? "Se iese..." : "Ieșire"}
    </button>
  );
}
