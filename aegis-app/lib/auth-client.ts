"use client";

import { createAuthClient } from "better-auth/react";

// IMPORTANT: baseURL must match the server's baseURL exactly (including protocol + domain).
// We use NEXT_PUBLIC_APP_URL so both client and server use the same value.
// Do NOT use window.location.origin — it can differ from the configured baseURL.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
