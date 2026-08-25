"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/supabase/auth-errors";

// Formularul de autentificare. Client component pentru ca schimba cookie-uri de
// sesiune in browser. Tot textul este romanesc, inclusiv erorile venite de la
// Supabase, care sunt englezesti si se traduc in auth-errors.ts.
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (email.trim().length === 0) {
      setError("Introdu adresa de email.");
      return;
    }
    if (password.length === 0) {
      setError("Introdu parola.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(translateAuthError(authError.message));
        setPending(false);
        return;
      }
      // Sesiunea este in cookie-uri. refresh() face middleware-ul sa reevalueze
      // cererea, deci redirectarea vine din acelasi loc ca protectia rutelor.
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(translateAuthError(err instanceof Error ? err.message : null));
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl bg-rc-ink border border-rc-ink-2 p-7"
      data-testid="login-form"
    >
      <label htmlFor="email" className="block text-sm font-medium text-rc-white mb-2">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg bg-rc-black border border-rc-ink-2 px-3.5 py-2.5 text-rc-white placeholder:text-rc-muted outline-none focus:border-rc-orange"
        placeholder="nume@firma.ro"
      />

      <label
        htmlFor="password"
        className="block text-sm font-medium text-rc-white mt-5 mb-2"
      >
        Parolă
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg bg-rc-black border border-rc-ink-2 px-3.5 py-2.5 text-rc-white placeholder:text-rc-muted outline-none focus:border-rc-orange"
        placeholder="Parola contului"
      />

      {error ? (
        <p
          role="alert"
          data-testid="login-error"
          className="mt-5 rounded-lg border border-rc-orange-deep bg-rc-orange-soft px-3.5 py-2.5 text-sm text-rc-black"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        data-testid="login-submit"
        className="mt-6 w-full rounded-lg bg-rc-orange px-4 py-2.5 font-semibold text-rc-black transition-colors hover:bg-rc-orange-dark disabled:opacity-60"
      >
        {pending ? "Se autentifică..." : "Intră în cont"}
      </button>
    </form>
  );
}
