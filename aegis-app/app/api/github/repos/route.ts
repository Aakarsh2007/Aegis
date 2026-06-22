import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { makeAppOctokit } from "@/lib/github";
import { headers } from "next/headers";

export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const settings = settingsRows[0];
    if (!settings?.githubInstallationId) {
      return NextResponse.json({ repos: [], appInstalled: false });
    }

    const octokit = makeAppOctokit(settings.githubInstallationId);
    
    const response = await octokit.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    const repos = response.data.repositories.map((r) => ({
      id: r.id,
      name: r.name,
      owner: r.owner.login,
      fullName: r.full_name,
      defaultBranch: r.default_branch,
    }));

    return NextResponse.json({ repos, appInstalled: true, installationId: settings.githubInstallationId });
  } catch (err) {
    console.error("[GitHub App List Repos] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch repositories from GitHub App" },
      { status: 500 }
    );
  }
}
