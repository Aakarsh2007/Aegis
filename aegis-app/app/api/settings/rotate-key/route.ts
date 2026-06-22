import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateApiKey } from "@/lib/probe-auth";
import { CreateApiKeySchema } from "@/lib/validations";
import { headers } from "next/headers";

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const parsed = CreateApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { name } = parsed.data;
  const { key, keyHash, keyPrefix } = generateApiKey();

  try {
    await db.insert(apiKeys).values({
      userId: session.user.id,
      name,
      keyHash,
      keyPrefix,
    });

    return NextResponse.json({
      apiKey: key,
      keyPrefix,
      message:
        "API key created. Save it now — it will not be shown again.",
    });
  } catch (err) {
    console.error("[Rotate Key] Error:", err);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get("id");

  if (!keyId) {
    return NextResponse.json({ error: "Key ID required" }, { status: 400 });
  }

  try {
    // Ensure the key belongs to this user
    const existing = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    await db.delete(apiKeys).where(eq(apiKeys.id, keyId));

    return NextResponse.json({ message: "API key revoked" });
  } catch (err) {
    console.error("[Delete Key] Error:", err);
    return NextResponse.json(
      { error: "Failed to revoke API key" },
      { status: 500 }
    );
  }
}
