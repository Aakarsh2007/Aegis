import { db } from "@/lib/db";
import {
  incidents,
  incidentEvents,
  remediations,
  userSettings,
  repositories,
  auditLogs,
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
import { sendAlerts } from "@/lib/alerts";

export interface RemediationParams {
  incidentId: string;
  userId: string;
  probeId: string;
  cpu: number;
  memory: number;
  issueType: string;
  stackTrace?: string;
}

export interface ProposalResult {
  success: boolean;
  remediationId?: string;
  confidenceScore?: number;
  targetFile?: string;
  errorMessage?: string;
}

export interface ExecutionResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  branchName?: string;
  errorMessage?: string;
}

// Simple diff helper to generate a unified diff for patch comparison
function generateDiff(original: string, patched: string, filename: string): string {
  const origLines = original.split("\n");
  const patchLines = patched.split("\n");
  let diff = `--- a/${filename}\n+++ b/${filename}\n`;
  
  let i = 0, j = 0;
  while (i < origLines.length || j < patchLines.length) {
    if (i < origLines.length && j < patchLines.length && origLines[i] === patchLines[j]) {
      diff += `  ${origLines[i]}\n`;
      i++; j++;
    } else {
      if (i < origLines.length) {
        diff += `- ${origLines[i]}\n`;
        i++;
      }
      if (j < patchLines.length) {
        diff += `+ ${patchLines[j]}\n`;
        j++;
      }
    }
  }
  return diff;
}

/**
 * Stage 1: Generate patch proposal
 * Analyzes logs, fetches source code, generates patch using Gemini, and saves it in pending_review.
 */
export async function generateRemediationProposal(
  params: RemediationParams
): Promise<ProposalResult> {
  const { incidentId, userId, probeId, cpu, memory, issueType, stackTrace } = params;

  console.log(`[Remediation Proposal] Starting proposal for incident ${incidentId}`);

  // Create remediation record in pending status
  const [remediationRecord] = await db
    .insert(remediations)
    .values({
      incidentId,
      status: "pending_review",
    })
    .returning({ id: remediations.id });

  const remediationId = remediationRecord.id;

  try {
    // Load settings & config
    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const settings = settingsRows[0];
    const githubToken = decryptOptional(settings?.githubAccessToken);
    const installationId = settings?.githubInstallationId;
    const geminiKey = decryptOptional(settings?.geminiApiKey);

    // Get default repository details
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

    // Step 1: Locate the target file
    let targetFile = "app.py"; // default fallback
    if (stackTrace && stackTrace.length > 5) {
      try {
        const genai = makeGeminiClient(geminiKey);
        targetFile = await extractFilenameFromStackTrace(genai, stackTrace);
        console.log(`[Remediation Proposal] Target file identified: ${targetFile}`);

        await db.insert(incidentEvents).values({
          incidentId,
          eventType: "ai_analysis",
          message: `AI identified target file: ${targetFile}`,
          metadata: { targetFile },
        });
      } catch (err) {
        console.error(`[Remediation Proposal] Gemini filename extraction failed:`, err);
      }
    }

    // Update incident with affected file
    await db
      .update(incidents)
      .set({ affectedFile: targetFile, updatedAt: new Date() })
      .where(eq(incidents.id, incidentId));

    // Step 2: Fetch code file from repository (using App installation or PAT)
    let originalCode = "# No code available";
    let fileSha = "";

    if ((githubToken || installationId) && repoOwner && repoName) {
      try {
        const octokit = makeOctokit({ token: githubToken, installationId });
        const fileData = await fetchFileFromRepo(
          octokit,
          repoOwner,
          repoName,
          targetFile,
          defaultBranch
        );
        originalCode = fileData.content;
        fileSha = fileData.sha;
      } catch (err) {
        console.error(`[Remediation Proposal] Could not fetch code file from GitHub:`, err);
      }
    }

    // Step 3: Propose patch code with Gemini
    const genai = makeGeminiClient(geminiKey);
    const patchResult = await generateCodePatch(genai, {
      originalCode,
      issueType,
      cpuUsage: cpu,
      memoryUsage: memory,
      stackTrace,
      filename: targetFile,
    });

    const confidenceScore = calculateConfidenceScore({
      hasStackTrace: !!stackTrace && stackTrace.length > 5,
      stackTraceLength: stackTrace?.length ?? 0,
      filenameExplicit: !!stackTrace,
      patchSize: patchResult.patchedCode.length,
      originalSize: originalCode.length,
    });

    const diff = generateDiff(originalCode, patchResult.patchedCode, targetFile);

    // Save details to the remediation record
    await db
      .update(remediations)
      .set({
        status: "pending_review",
        targetFile,
        originalCode,
        patchedCode: patchResult.patchedCode,
        patchDiff: diff,
        confidenceScore,
        explanation: patchResult.explanation,
        rollbackNotes: patchResult.rollbackNotes,
        geminiModel: "gemini-2.5-flash",
      })
      .where(eq(remediations.id, remediationId));

    await db
      .update(incidents)
      .set({
        aiConfidenceScore: confidenceScore,
        aiReasoning: patchResult.explanation,
        aiPatchExplanation: patchResult.explanation,
        status: "open", // Keeps the incident open for human review
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, incidentId));

    await db.insert(incidentEvents).values({
      incidentId,
      eventType: "proposal_created",
      message: `AI generated patch proposal for ${targetFile} (Confidence: ${(confidenceScore * 100).toFixed(0)}%)`,
      metadata: { targetFile, confidenceScore },
    });

    // Send notifications to Slack/Discord if configured
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await sendAlerts({
      incidentId,
      title: issueType,
      severity: cpu > 90 || memory > 95 ? "critical" : "warning",
      probeId,
      issueType,
      dashboardUrl: appUrl,
      slackWebhookUrl: decryptOptional(settings?.slackWebhookUrl),
      discordWebhookUrl: decryptOptional(settings?.discordWebhookUrl),
    });

    return {
      success: true,
      remediationId,
      confidenceScore,
      targetFile,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Remediation Proposal] Proposal failed: ${msg}`);

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
        errorMessage: msg,
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, incidentId));

    await db.insert(incidentEvents).values({
      incidentId,
      eventType: "error",
      fromStatus: "open",
      toStatus: "failed",
      message: `Remediation failed: ${msg}`,
    });

    return { success: false, errorMessage: msg };
  }
}

/**
 * Stage 2: Approve & execute proposal
 * Commits the approved patch to a new branch on GitHub and opens a Pull Request.
 */
export async function executeRemediation(
  remediationId: string,
  userId: string
): Promise<ExecutionResult> {
  console.log(`[Remediation Execution] Executing remediation ${remediationId}`);

  try {
    // Load remediation proposal details
    const remRows = await db
      .select()
      .from(remediations)
      .where(eq(remediations.id, remediationId))
      .limit(1);

    const remediation = remRows[0];
    if (!remediation) {
      return { success: false, errorMessage: "Remediation proposal not found" };
    }

    if (remediation.status === "success") {
      return { success: false, errorMessage: "Remediation patch already applied" };
    }

    const incidentId = remediation.incidentId;

    // Load Incident
    const incRows = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId))
      .limit(1);

    const incident = incRows[0];
    if (!incident) {
      return { success: false, errorMessage: "Incident not found" };
    }

    // Load user settings
    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const settings = settingsRows[0];
    const githubToken = decryptOptional(settings?.githubAccessToken);
    const installationId = settings?.githubInstallationId;

    // Fetch repository
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

    if ((!githubToken && !installationId) || !repoOwner || !repoName) {
      return {
        success: false,
        errorMessage: "No GitHub credentials or repository configured.",
      };
    }

    const octokit = makeOctokit({ token: githubToken, installationId });
    const targetFile = remediation.targetFile ?? "app.py";
    const patchedCode = remediation.patchedCode;

    if (!patchedCode) {
      return { success: false, errorMessage: "No patched code generated in proposal." };
    }

    // Fetch latest file SHA to ensure no drift
    const fileData = await fetchFileFromRepo(
      octokit,
      repoOwner,
      repoName,
      targetFile,
      defaultBranch
    );
    const fileSha = fileData.sha;

    // Execute Git actions: Create branch -> Commit patched code -> Open Pull Request
    const branchName = `aegis-fix-${incidentId.slice(0, 8)}-${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    await createBranch(octokit, repoOwner, repoName, branchName, defaultBranch);

    await commitFileToRepo(
      octokit,
      repoOwner,
      repoName,
      targetFile,
      patchedCode,
      fileSha,
      `fix(aegis): patch code issue in ${targetFile}`,
      branchName
    );

    const prBody = buildPRBody({
      incidentId,
      probeId: incident.probeId,
      issueType: incident.issueType ?? "Incident",
      cpuUsage: incident.errorMessage ? 0 : 90, // mock or fetch from metrics if needed
      memoryUsage: incident.errorMessage ? 0 : 95,
      targetFile,
      explanation: remediation.explanation ?? "AI code correction applied.",
      appUrl,
    });

    const { url: prUrl, number: prNumber } = await createPullRequest(
      octokit,
      repoOwner,
      repoName,
      {
        title: `🛡️ Aegis Fix: ${incident.title?.slice(0, 60) ?? "Auto patch"}`,
        body: prBody,
        head: branchName,
        base: defaultBranch,
      }
    );

    // Save final status
    await db
      .update(remediations)
      .set({
        status: "success",
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
        prUrl,
        prNumber,
        branchName,
        updatedAt: new Date(),
        resolvedAt: new Date(),
      })
      .where(eq(incidents.id, incidentId));

    await db.insert(incidentEvents).values({
      incidentId,
      eventType: "pr_created",
      fromStatus: "open",
      toStatus: "resolved",
      message: `PR created and approved: ${prUrl}`,
      metadata: { prUrl, prNumber, branchName, targetFile },
    });

    // Write audit log
    await db.insert(auditLogs).values({
      userId,
      action: "approve_patch",
      resourceType: "remediation",
      resourceId: remediationId,
      metadata: { incidentId, prUrl, prNumber, branchName, targetFile },
    });

    return {
      success: true,
      prUrl,
      prNumber,
      branchName,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Remediation Execution] Execution failed: ${msg}`);
    return { success: false, errorMessage: msg };
  }
}

/**
 * Backward compatibility stub
 */
export async function remediateIncident(
  params: RemediationParams
): Promise<{ success: boolean; prUrl?: string }> {
  // Dispatches proposal generation and lets the user approve it manually via dashboard
  const res = await generateRemediationProposal(params);
  return { success: res.success };
}
