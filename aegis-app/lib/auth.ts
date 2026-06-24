import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

// Build trusted origins — include all variations to avoid "invalid origin" errors
function buildTrustedOrigins(): string[] {
  const origins = new Set<string>();

  // Always include localhost for development
  origins.add("http://localhost:3000");
  origins.add("http://localhost:3001");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    // Remove trailing slash if present
    const clean = appUrl.replace(/\/$/, "");
    origins.add(clean);
    // Also add with and without www
    if (clean.startsWith("https://")) {
      const domain = clean.replace("https://", "");
      origins.add(`https://${domain}`);
      origins.add(`https://www.${domain}`);
    }
  }

  // Add Vercel preview URL patterns
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }

  return Array.from(origins);
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production-32chars-min",
  baseURL: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      scope: ["user:email", "repo"],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  // Allow all origins — better-auth validates the session via httpOnly cookie,
  // not CORS, so this is safe. The cookie SameSite policy prevents CSRF.
  trustedOrigins: buildTrustedOrigins(),
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // lax instead of strict so OAuth redirects work
    },
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
