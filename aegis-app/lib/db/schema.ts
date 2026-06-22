import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  real,
  bigserial,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Better Auth Tables ──────────────────────────────────────────────────────

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── API Keys ────────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    keyHash: varchar("key_hash", { length: 255 }).notNull().unique(),
    keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
    lastUsed: timestamp("last_used"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("api_keys_key_hash_idx").on(t.keyHash)]
);

// ─── Probes ──────────────────────────────────────────────────────────────────

export const probes = pgTable(
  "probes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    probeId: varchar("probe_id", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }),
    hostname: varchar("hostname", { length: 255 }),
    lastSeen: timestamp("last_seen"),
    status: varchar("status", { length: 20 }).notNull().default("offline"),
    version: varchar("version", { length: 50 }),
    tags: jsonb("tags").default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("probes_user_probe_idx").on(t.userId, t.probeId)]
);

// ─── Repositories ────────────────────────────────────────────────────────────

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    owner: varchar("owner", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 512 }).notNull(),
    defaultBranch: varchar("default_branch", { length: 255 }).default("main"),
    githubInstallationId: varchar("github_installation_id", { length: 255 }),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("repositories_user_fullname_idx").on(t.userId, t.fullName)]
);

// ─── System Metrics ──────────────────────────────────────────────────────────

export const systemMetrics = pgTable(
  "system_metrics",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    probeId: varchar("probe_id", { length: 100 }).notNull(),
    cpuUsage: real("cpu_usage").notNull(),
    memoryUsage: real("memory_usage").notNull(),
    diskUsage: real("disk_usage"),
    timestamp: timestamp("timestamp").defaultNow(),
  },
  (t) => [index("metrics_user_time_idx").on(t.userId, t.timestamp)]
);

// ─── Incidents ───────────────────────────────────────────────────────────────

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    probeId: varchar("probe_id", { length: 100 }).notNull(),
    repositoryId: uuid("repository_id").references(() => repositories.id),
    severity: varchar("severity", { length: 20 }).notNull().default("critical"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    title: varchar("title", { length: 500 }),
    issueType: varchar("issue_type", { length: 100 }),
    stackTrace: text("stack_trace"),
    affectedFile: varchar("affected_file", { length: 500 }),
    aiConfidenceScore: real("ai_confidence_score"),
    aiReasoning: text("ai_reasoning"),
    aiPatchExplanation: text("ai_patch_explanation"),
    prUrl: varchar("pr_url", { length: 1000 }),
    prNumber: integer("pr_number"),
    branchName: varchar("branch_name", { length: 500 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [
    index("incidents_user_status_idx").on(t.userId, t.status),
    index("incidents_user_created_idx").on(t.userId, t.createdAt),
  ]
);

// ─── Incident Events ─────────────────────────────────────────────────────────

export const incidentEvents = pgTable("incident_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  incidentId: uuid("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  fromStatus: varchar("from_status", { length: 20 }),
  toStatus: varchar("to_status", { length: 20 }),
  message: text("message"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Remediations ────────────────────────────────────────────────────────────

export const remediations = pgTable("remediations", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).default("pending"),
  targetFile: varchar("target_file", { length: 500 }),
  originalCode: text("original_code"),
  patchedCode: text("patched_code"),
  patchDiff: text("patch_diff"),
  confidenceScore: real("confidence_score"),
  explanation: text("explanation"),
  rollbackNotes: text("rollback_notes"),
  geminiModel: varchar("gemini_model", { length: 100 }),
  prUrl: varchar("pr_url", { length: 1000 }),
  prNumber: integer("pr_number"),
  branchName: varchar("branch_name", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// ─── User Settings ───────────────────────────────────────────────────────────

export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  githubAccessToken: text("github_access_token"),
  githubInstallationId: varchar("github_installation_id", { length: 255 }),
  geminiApiKey: text("gemini_api_key"),
  defaultRepository: uuid("default_repository").references(
    () => repositories.id
  ),
  webhookUrl: varchar("webhook_url", { length: 1000 }),
  slackWebhookUrl: text("slack_webhook_url"),
  discordWebhookUrl: text("discord_webhook_url"),
  emailAlerts: boolean("email_alerts").default(true),
  onboardingStep: integer("onboarding_step").default(1),
  plan: varchar("plan", { length: 20 }).default("free"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }),
  resourceId: varchar("resource_id", { length: 255 }),
  metadata: jsonb("metadata").default({}),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  apiKeys: many(apiKeys),
  probes: many(probes),
  repositories: many(repositories),
  systemMetrics: many(systemMetrics),
  incidents: many(incidents),
  settings: one(userSettings),
  auditLogs: many(auditLogs),
}));

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  user: one(users, { fields: [incidents.userId], references: [users.id] }),
  repository: one(repositories, {
    fields: [incidents.repositoryId],
    references: [repositories.id],
  }),
  events: many(incidentEvents),
  remediation: one(remediations, {
    fields: [incidents.id],
    references: [remediations.incidentId],
  }),
}));

export const incidentEventsRelations = relations(incidentEvents, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentEvents.incidentId],
    references: [incidents.id],
  }),
}));

export const remediationsRelations = relations(remediations, ({ one }) => ({
  incident: one(incidents, {
    fields: [remediations.incidentId],
    references: [incidents.id],
  }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, { fields: [userSettings.userId], references: [users.id] }),
  defaultRepo: one(repositories, {
    fields: [userSettings.defaultRepository],
    references: [repositories.id],
  }),
}));
