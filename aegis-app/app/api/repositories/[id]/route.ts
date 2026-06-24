import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { repositories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  try {
    const result = await db
      .delete(repositories)
      .where(and(eq(repositories.id, id), eq(repositories.userId, userId)))
      .returning({ id: repositories.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Repository deleted" });
  } catch (err) {
    console.error("[Delete Repo] Error:", err);
    return NextResponse.json({ error: "Failed to delete repository" }, { status: 500 });
  }
}
