import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userSettings, apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptOptional, decryptOptional } from "@/lib/crypto";
import { UpdateSettingsSchema } from "@/lib/validations";
import { headers } from "next/headers";

export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [settingsRows, apiKeyRows] = await Promise.all([
      db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1),
      db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          lastUsed: apiKeys.lastUsed,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId))
        .orderBy(apiKeys.createdAt),
    ]);

    const settings = settingsRows[0];

    return NextResponse.json({
      email: session.user.email,
      name: session.user.name,
      githubTokenSet: !!settings?.githubAccessToken,
      githubInstallationId: settings?.githubInstallationId ?? null,
      geminiApiKeySet: !!settings?.geminiApiKey,
      webhookUrl: settings?.webhookUrl ?? null,
      slackWebhookUrl: settings?.slackWebhookUrl
        ? "[encrypted]"
        : null,
      discordWebhookUrl: settings?.discordWebhookUrl
        ? "[encrypted]"
        : null,
      emailAlerts: settings?.emailAlerts ?? true,
      onboardingStep: settings?.onboardingStep ?? 1,
      plan: settings?.plan ?? "free",
      defaultRepository: settings?.defaultRepository ?? null,
      apiKeys: apiKeyRows,
    });
  } catch (err) {
    console.error("[Settings GET] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const {
    githubToken,
    geminiApiKey,
    webhookUrl,
    slackWebhookUrl,
    discordWebhookUrl,
    emailAlerts,
    defaultRepository,
  } = parsed.data;

  const userId = session.user.id;

  try {
    const existing = await db
      .select({ id: userSettings.id })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (githubToken !== undefined) {
      updates.githubAccessToken = encryptOptional(githubToken);
    }
    if (geminiApiKey !== undefined) {
      updates.geminiApiKey = encryptOptional(geminiApiKey);
    }
    if (webhookUrl !== undefined) {
      updates.webhookUrl = webhookUrl || null;
    }
    if (slackWebhookUrl !== undefined) {
      updates.slackWebhookUrl = encryptOptional(slackWebhookUrl);
    }
    if (discordWebhookUrl !== undefined) {
      updates.discordWebhookUrl = encryptOptional(discordWebhookUrl);
    }
    if (emailAlerts !== undefined) {
      updates.emailAlerts = emailAlerts;
    }
    if (defaultRepository !== undefined) {
      updates.defaultRepository = defaultRepository;
    }

    if (existing.length > 0) {
      await db
        .update(userSettings)
        .set(updates)
        .where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({
        userId,
        ...updates,
      });
    }

    return NextResponse.json({ message: "Settings updated" });
  } catch (err) {
    console.error("[Settings PATCH] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
