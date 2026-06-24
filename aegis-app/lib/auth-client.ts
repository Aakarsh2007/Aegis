"use client";

import { createAuthClient } from "better-auth/react";

// Always use current window origin in browser — this eliminates "invalid origin" errors
// because the client automatically matches whatever domain the user is on.
export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
