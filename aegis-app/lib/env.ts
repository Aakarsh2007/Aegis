import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .length(64, "FIELD_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)"),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  NEXT_PUBLIC_GITHUB_APP_SLUG: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  CPU_THRESHOLD: z.coerce.number().min(0).max(100).default(80),
  MEM_THRESHOLD: z.coerce.number().min(0).max(100).default(90),
});

type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // Only throw in non-build environments
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      console.error(`❌ Invalid environment variables:\n${issues}`);
    }
  }
  return parsed.data ?? (process.env as unknown as Env);
}

export const env = validateEnv();
