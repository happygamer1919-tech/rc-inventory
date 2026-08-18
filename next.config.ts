import type { NextConfig } from "next";

// Preview faza 1: totul este static si local.
// Fara variabile de mediu, fara servicii externe, fara imagini de la distanta.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 genereaza automat AGENTS.md si CLAUDE.md in radacina.
  // Le oprim: nu sunt cerute de board si nu vrem fisiere negenerate de noi in repo.
  agentRules: false,
};

export default nextConfig;
