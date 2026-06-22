import { db } from "@/lib/db";
import {
  incidents,
  incidentEvents,
  remediations,
  userSettings,
  repositories,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptOptional } from "@/lib/crypto";
import {
  makeGeminiClient,
  extractFilenameFromStackTrace,
  generateCodePatch,
  calculateConfidenceScore,
} from "@/lib/gemini";
import {
  makeOctokit,
  fetchFileFromRepo,
  createBranch,
  commitFileToRepo,
  createPullRequest,
  buildPRBody,
} from "@/lib/github";

export interface RemediationParams {
  incidentId: string;
  userId: string;
  probeId: string;
  cpu: number;
  memory: number;
  issueType: string;
  stackTrace?: string;
}

export interface RemediationResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  branchName?: string;
  targetFile?: string;
  confidenceScore?: number;
  explanation?: string;
  errorMessage?: string;
  failedStep?: string;
}

export async function remediateIncident(
  params: RemediationParams
): Promise<RemediationResult> {
  const { incidentId, userId, probeId, cpu, memory, issueType, stackTrace } =
    params;

  console.log(`[Remediation] Starting for incident ${incidentId}`);

  // Create remediation record
  const [remediationRecord] = await db
    .insert(remediations)
    .values({
      incidentId,
      status: "running",
    })
    .returning({ id: remediations.id });

  const remediationId = remediationRecord.id;

  try {
    // ── Load user settings ─────────────────────────────────────────────────
    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const settings = settingsRows[0];

    const githubToken = decryptOptional(settings?.githubAccessToken);
    const geminiKey = decryptOptional(settings?.geminiApiKey);

    // ── Load default repository ────────────────────────────────────────────
    let repoOwner: string | null = null;
    let repoName: string | null = null;
    let defaultBranch = "main";

    if (settings?.defaultRepository) {
      const repoRows = await db
        .select()
        .from(repositories)
        .where(eq(repositories.id, settings.defaultRepository))
        .limit(1);

      if (repoRows[0]) {
        repoOwner = repoRows[0].owner;
        repoName = repoRows[0].name;
        defaultBranch = repoRows[0].defaultBranch ?? "main";
      }
    }

    // ── Step 1: Extract filename from stack trace ──────────────────────────
    let targetFile: string;

    if (!stackTrace || stackTrace.length < 5) {
      // No stack trace — try a generic approach
      targetFile = "app.py"; // fallback
      console.log(`[Remediation] No stack trace, using fallback file: ${targetFile}`);
    } else {
      try {
        const genai = makeGeminiClient(geminiKey);
        targetFile = await extractFilenameFromStackTrace(genai, stackTrace);
        console.log(`[Remediation] Target file: ${targetFile}`);

        await db.insert(incidentEvents).values({
          incidentId,
          eventType: "ai_analysis",
          message: `AI identified target file: ${targetFile}`,
          metadata: { targetFile },
        });
      } catch (err) {
        const msg = `Gemini filename extraction failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[Remediation] ❌ ${msg}`);
        return await markFailed(
          remediationId,
          incidentId,
          msg,
          "gemini_extraction"
        );
      }
    }

    // Update incident with affected file
    await db
      .update(incidents)
      .set({ affectedFile: targetFile, updatedAt: new Date() })
      .where(eq(incidents.id, incidentId));

    // ── Step 2: Fetch file from GitHub ────────────────────────────────────
    if (!githubToken || !repoOwner || !repoName) {
      const msg =
        "No GitHub credentials or repository configured. Skipping PR creation.";
      console.warn(`[Remediation] ⚠️ ${msg}`);

      // Still run AI analysis without the PR
      await runAiAnalysisOnly(
        remediationId,
        incidentId,
        geminiKey,
        targetFile,
        issueType,
        cpu,
        memory,
        stackTrace
      );
      return {
        success: false,
        errorMessage: msg,
        failedStep: "github_config",
      };
    }

    let originalCode: string;
    let fileSha: string;

    try {
      const octokit = makeOctokit(githubToken);
      const fileData = await fetchFileFromRepo(
        octokit,
        repoOwner,
        repoName,
        targetFile,
        defaultBranch
      );
      originalCode = fileData.content;
      fileSha = fileData.sha;
      console.log(`[Remediation] Fetched ${targetFile} (${originalCode.length} chars)`);
    } catch (err) {
      const msg = `GitHub file fetch failed for '${targetFile}': ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[Remediation] ❌ ${msg}`);
      return await markFailed(
        remediationId,
        incidentId,
        msg,
        "github_fetch"
      );
    }

    // ── Step 3: Generate patch ─────────────────────────────────────────────
    let patchedCode: string;
    let explanation: string;
    let rollbackNotes: string;
    let confidenceScore: number;

    try {
      const genai = makeGeminiClient(geminiKey);
      const result = await generateCodePatch(genai, {
        originalCode,
        issueType,
        cpuUsage: cpu,
        memoryUsage: memory,
        stackTrace,
        filename: targetFile,
      });

      patchedCode = result.patchedCode;
      explanation = result.explanation;
      rollbackNotes = result.rollbackNotes;

      confidenceScore = calculateConfidenceScore({
        hasStackTrace: !!stackTrace && stackTrace.length > 5,
        stackTraceLength: stackTrace?.length ?? 0,
        filenameExplicit: !!stackTrace,
        patchSize: patchedCode.length,
        originalSize: originalCode.length,
      });

      console.log(
        `[Remediation] Patch generated (confidence: ${(confidenceScore * 100).toFixed(0)}%)`
      );
    } catch (err) {
      const msg = `Gemini patch generation failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[Remediation] ❌ ${msg}`);
      return await markFailed(
        remediationId,
        incidentId,
        msg,
        "gemini_patch"
      );
    }

    // ── Step 4: Create branch + commit + PR ───────────────────────────────
    const branchName = `aegis-fix-${incidentId.slice(0, 8)}-${Date.now()}`;
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    try {
      const octokit = makeOctokit(githubToken);

      await createBranch(octokit, repoOwner, repoName, branchName, defaultBranch);

      await commitFileToRepo(
        octokit,
        repoOwner,
        repoName,
        targetFile,
        patchedCode,
        fileSha,
        `fix(aegis): auto-remediation of ${issueType} in ${targetFile}`,
        branchName
      );

      const prBody = buildPRBody({
        incidentId,
        probeId,
        issueType,
        cpuUsage: cpu,
        memoryUsage: memory,
        targetFile,
        explanation,
        appUrl,
      });

      const { url: prUrl, number: prNumber } = await createPullRequest(
        octokit,
        repoOwner,
        repoName,
        {
          title: `🛡️ Aegis Auto-Fix: ${issueType.slice(0, 60)}`,
          body: prBody,
          head: branchName,
          base: defaultBranch,
        }
      );

      // ── Update all records ───────────────────────────────────────────────
      await db
        .update(remediations)
        .set({
          status: "success",
          targetFile,
          originalCode,
          patchedCode,
          confidenceScore,
          explanation,
          rollbackNotes,
          geminiModel: "gemini-2.5-flash",
          prUrl,
          prNumber,
          branchName,
          completedAt: new Date(),
        })
        .where(eq(remediations.id, remediationId));

      await db
        .update(incidents)
        .set({
          status: "resolved",
          aiConfidenceScore: confidenceScore,
          aiReasoning: explanation,
          aiPatchExplanation: explanation,
          prUrl,
          prNumber,
          branchName,
          affectedFile: targetFile,
          updatedAt: new Date(),
          resolvedAt: new Date(),
        })
        .where(eq(incidents.id, incidentId));

      await db.insert(incidentEvents).values({
        incidentId,
        eventType: "pr_created",
        fromStatus: "analyzing",
        toStatus: "resolved",
        message: `PR created: ${prUrl}`,
        metadata: { prUrl, prNumber, branchName, targetFile, confidenceScore },
      });

      console.log(`[Remediation] ✅ Incident ${incidentId} resolved. PR: ${prUrl}`);

      return {
        success: true,
        prUrl,
        prNumber,
        branchName,
        targetFile,
        confidenceScore,
        explanation,
      };
    } catch (err) {
      const msg = `GitHub PR creation failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[Remediation] ❌ ${msg}`);
      return await markFailed(remediationId, incidentId, msg, "github_pr");
    }
  } catch (err) {
    const msg = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[Remediation] ❌ ${msg}`);
    return await markFailed(remediationId, incidentId, msg, "unknown");
  }
}

async function runAiAnalysisOnly(
  remediationId: string,
  incidentId: string,
  geminiKey: string | null | undefined,
  targetFile: string,
  issueType: string,
  cpu: number,
  memory: number,
  stackTrace?: string
): Promise<void> {
  try {
    const genai = makeGeminiClient(geminiKey);
    const { explanation } = await generateCodePatch(genai, {
      originalCode: stackTrace ?? "# No code available",
      issueType,
      cpuUsage: cpu,
      memoryUsage: memory,
      stackTrace,
      filename: targetFile,
    });

    await db
      .update(remediations)
      .set({
        status: "failed",
        explanation,
        targetFile,
        completedAt: new Date(),
      })
      .where(eq(remediations.id, remediationId));

    await db
      .update(incidents)
      .set({
        aiReasoning: explanation,
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, incidentId));
  } catch {
    // Best effort
  }
}

async function markFailed(
  remediationId: string,
  incidentId: string,
  errorMessage: string,
  failedStep: string
): Promise<RemediationResult> {
  try {
    await db
      .update(remediations)
      .set({
        status: "failed",
        completedAt: new Date(),
      })
      .where(eq(remediations.id, remediationId));

    await db
      .update(incidents)
      .set({
        status: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, incidentId));

    await db.insert(incidentEvents).values({
      incidentId,
      eventType: "error",
      fromStatus: "analyzing",
      toStatus: "failed",
      message: errorMessage,
      metadata: { failedStep },
    });
  } catch (dbErr) {
    console.error(
      `[Remediation] Could not update incident ${incidentId} to failed:`,
      dbErr
    );
  }

  return { success: false, errorMessage, failedStep };
}
