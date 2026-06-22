import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get("installation_id");

  if (!installationId) {
    return NextResponse.redirect(new URL("/settings", request.url));
  }

  const userId = session.user.id;

  try {
    const existing = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userSettings)
        .set({
          githubInstallationId: installationId,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({
        userId,
        githubInstallationId: installationId,
      });
    }

    return NextResponse.redirect(new URL("/settings?github_success=true", request.url));
  } catch (err) {
    console.error("[GitHub App Callback] Error:", err);
    return NextResponse.redirect(new URL("/settings?github_error=db_error", request.url));
  }
}
