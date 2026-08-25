// Clientul Supabase pentru server components si route handlers.
//
// Foloseste implicit pachetul @supabase/ssr: gestiunea cookie-urilor si
// reimprospatarea sesiunii sunt ale lui. Nu se scrie tokenul in localStorage,
// nu se calculeaza manual momentul reimprospatarii si nu se prelungeste durata
// implicita a sesiunii. Regula vine din defaults-urile cardului P2-02.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { COOKIE_OPTIONS } from "./cookies";
import type { AppRole, SessionUser } from "./types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Apelat dintr-un server component: cookie-urile sunt deja trimise.
          // Middleware-ul reimprospateaza sesiunea, deci ignorarea este sigura.
        }
      },
    },
  });
}

/**
 * Utilizatorul curent impreuna cu rolul lui, sau null.
 *
 * getUser() valideaza tokenul la serverul de autentificare. getSession() ar citi
 * doar cookie-ul, care este date furnizate de client si nu proba de identitate.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active")
    .eq("id", userData.user.id)
    .single();

  // Un utilizatorul autentificat fara rand in profiles nu are rol, deci nu are
  // acces. Randurile se creeaza manual, o data cu contul.
  if (profileError || !profile || !profile.active) return null;

  return {
    id: profile.id,
    email: profile.email ?? userData.user.email ?? null,
    role: profile.role as AppRole,
    fullName: profile.full_name,
  };
}
