// Clientul Supabase pentru componente de browser. Singurul lui rol in P2-02
// este formularul de autentificare: acesta trebuie sa fie un client component
// pentru ca schimba cookie-uri de sesiune in browser.

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { COOKIE_OPTIONS } from "./cookies";

export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: COOKIE_OPTIONS,
  });
}
