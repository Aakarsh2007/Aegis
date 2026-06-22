import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { probes, apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateApiKey } from "@/lib/probe-auth";
import { CreateProbeSchema } from "@/lib/validations";
import { headers } from "next/headers";

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userProbes = await db
      .select()
      .from(probes)
      .where(eq(probes.userId, session.user.id))
      .orderBy(probes.createdAt);

    return NextResponse.json({ probes: userProbes });
  } catch (err) {
    console.error("[Probes GET] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch probes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateProbeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { name, probeId: customProbeId } = parsed.data;
  const probeId =
    customProbeId ??
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") +
      "-" +
      Date.now().toString(36);

  const { key, keyHash, keyPrefix } = generateApiKey();

  try {
    const [probe] = await db
      .insert(probes)
      .values({
        userId: session.user.id,
        probeId,
        name,
        status: "offline",
      })
      .returning();

    await db.insert(apiKeys).values({
      userId: session.user.id,
      name: `Probe: ${name}`,
      keyHash,
      keyPrefix,
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const installCommand = [
      `export AEGIS_API_KEY="${key}"`,
      `export AEGIS_ENDPOINT="${appUrl}"`,
      `g++ main.cpp -o aegis-probe -pthread -std=c++17`,
      `./aegis-probe --api-key "$AEGIS_API_KEY" --endpoint "$AEGIS_ENDPOINT"`,
    ].join(" && \\\n  ");

    return NextResponse.json(
      {
        probe,
        apiKey: key,
        installCommand,
        message: "Probe created. Save your API key — it will not be shown again.",
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return NextResponse.json(
        { error: "A probe with this ID already exists" },
        { status: 409 }
      );
    }
    console.error("[Probes POST] Error:", err);
    return NextResponse.json(
      { error: "Failed to create probe" },
      { status: 500 }
    );
  }
}
