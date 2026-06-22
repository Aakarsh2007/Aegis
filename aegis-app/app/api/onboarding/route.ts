import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userSettings, apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [settingsRows, keyRows] = await Promise.all([
      db
        .select({ onboardingStep: userSettings.onboardingStep })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1),
      db
        .select({ keyPrefix: apiKeys.keyPrefix })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId))
        .orderBy(apiKeys.createdAt)
        .limit(1),
    ]);

    const step = settingsRows[0]?.onboardingStep ?? 1;
    const keyPrefix = keyRows[0]?.keyPrefix ?? null;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const installCommand = keyPrefix
      ? [
          `export AEGIS_API_KEY="<your-api-key>"`,
          `export AEGIS_ENDPOINT="${appUrl}"`,
          `g++ main.cpp -o aegis-probe -pthread -std=c++17`,
          `./aegis-probe --api-key "$AEGIS_API_KEY" --endpoint "$AEGIS_ENDPOINT"`,
        ].join(" && \\\n  ")
      : null;

    return NextResponse.json({
      step,
      keyPrefix,
      installCommand,
    });
  } catch (err) {
    console.error("[Onboarding GET] Error:", err);
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
    body = {};
  }

  const { step } = body as { step?: number };
  if (typeof step !== "number" || step < 1 || step > 5) {
    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  }

  const userId = session.user.id;

  try {
    const existing = await db
      .select({ id: userSettings.id })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userSettings)
        .set({ onboardingStep: step, updatedAt: new Date() })
        .where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({
        userId,
        onboardingStep: step,
      });
    }

    return NextResponse.json({ step, message: "Onboarding step updated" });
  } catch (err) {
    console.error("[Onboarding PATCH] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
