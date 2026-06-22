import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { repositories, userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AddRepositorySchema } from "@/lib/validations";
import { headers } from "next/headers";

export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repos = await db
      .select()
      .from(repositories)
      .where(eq(repositories.userId, session.user.id))
      .orderBy(repositories.createdAt);

    return NextResponse.json({ repositories: repos });
  } catch (err) {
    console.error("[Repos GET] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const parsed = AddRepositorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { owner, name, defaultBranch } = parsed.data;
  const fullName = `${owner}/${name}`;

  try {
    const settingsRows = await db
      .select({ githubInstallationId: userSettings.githubInstallationId })
      .from(userSettings)
      .where(eq(userSettings.userId, session.user.id))
      .limit(1);

    const githubInstallationId = settingsRows[0]?.githubInstallationId ?? null;

    const [repo] = await db
      .insert(repositories)
      .values({
        userId: session.user.id,
        owner,
        name,
        fullName,
        defaultBranch,
        githubInstallationId,
        isActive: true,
      })
      .returning();

    return NextResponse.json({ repository: repo }, { status: 201 });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return NextResponse.json(
        { error: "Repository already connected" },
        { status: 409 }
      );
    }
    console.error("[Repos POST] Error:", err);
    return NextResponse.json(
      { error: "Failed to add repository" },
      { status: 500 }
    );
  }
}
