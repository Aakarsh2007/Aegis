import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ─── Probe Metrics ───────────────────────────────────────────────────────────

export const ProbeMetricsSchema = z.object({
  probe_id: z.string().min(1).max(100),
  cpu: z.number().min(0).max(100),
  memory: z.number().min(0).max(100),
  disk: z.number().min(0).max(100).optional(),
  stack_trace: z.string().optional(),
  hostname: z.string().max(255).optional(),
  version: z.string().max(50).optional(),
});

export const ProbeHealthSchema = z.object({
  probe_id: z.string().min(1).max(100),
  status: z.enum(["online", "offline"]).default("online"),
  hostname: z.string().max(255).optional(),
  version: z.string().max(50).optional(),
  timestamp: z.number().int().optional(),
});

// ─── Probes ──────────────────────────────────────────────────────────────────

export const CreateProbeSchema = z.object({
  name: z.string().min(1, "Probe name is required").max(255),
  probeId: z.string().min(1).max(100).optional(),
});

// ─── Repositories ────────────────────────────────────────────────────────────

export const AddRepositorySchema = z.object({
  owner: z.string().min(1, "Owner is required").max(255),
  name: z.string().min(1, "Repository name is required").max(255),
  defaultBranch: z.string().max(255).optional().default("main"),
});

// ─── Settings ────────────────────────────────────────────────────────────────

export const UpdateSettingsSchema = z.object({
  githubToken: z.string().optional(),
  geminiApiKey: z.string().optional(),
  webhookUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  slackWebhookUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  discordWebhookUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  emailAlerts: z.boolean().optional(),
  defaultRepository: z.string().uuid("Invalid repository ID").optional().nullable(),
});

// ─── API Keys ────────────────────────────────────────────────────────────────

export const CreateApiKeySchema = z.object({
  name: z.string().min(1, "API key name is required").max(100),
});

// ─── Incidents ───────────────────────────────────────────────────────────────

export const IncidentQuerySchema = z.object({
  status: z
    .enum(["all", "open", "analyzing", "resolved", "failed", "ignored"])
    .optional()
    .default("all"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ProbeMetricsInput = z.infer<typeof ProbeMetricsSchema>;
export type ProbeHealthInput = z.infer<typeof ProbeHealthSchema>;
export type CreateProbeInput = z.infer<typeof CreateProbeSchema>;
export type AddRepositoryInput = z.infer<typeof AddRepositorySchema>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type IncidentQueryInput = z.infer<typeof IncidentQuerySchema>;
