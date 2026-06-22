import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { incidents } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { IncidentQuerySchema } from "@/lib/validations";
import { headers } from "next/headers";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = IncidentQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );

  if (!query.success) {
    return NextResponse.json(
      { error: query.error.errors[0].message },
      { status: 400 }
    );
  }

  const { status, page, limit } = query.data;
  const userId = session.user.id;
  const offset = (page - 1) * limit;

  try {
    const whereConditions =
      status === "all"
        ? eq(incidents.userId, userId)
        : and(eq(incidents.userId, userId), eq(incidents.status, status));

    const rows = await db
      .select()
      .from(incidents)
      .where(whereConditions)
      .orderBy(desc(incidents.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      incidents: rows,
      pagination: {
        page,
        limit,
        hasMore: rows.length === limit,
      },
    });
  } catch (err) {
    console.error("[Incidents GET] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
