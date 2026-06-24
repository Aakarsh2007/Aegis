"use client";

import { createAuthClient } from "better-auth/react";

// baseURL must match server auth.ts baseURL exactly: ${NEXT_PUBLIC_APP_URL}/api/auth
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const authClient = createAuthClient({
  baseURL: appUrl,
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
