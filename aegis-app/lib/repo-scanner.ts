/**
 * Proactive Repository Scanner
 *
 * Scans a GitHub repository for bugs, performance issues, and security problems
 * using Gemini AI — WITHOUT needing a crash to trigger it.
 *
 * Flow:
 *   User clicks "Scan Repository" →
 *   Fetch repo file tree →
 *   Gemini selects suspicious files →
 *   Gemini analyzes each file →
 *   Create incidents for found issues →
 *   Optionally generate patches and open PRs
 */

import { GoogleGenAI } from "@google/genai";
import { Octokit } from "@octokit/rest";
import { db } from "@/lib/db";
import {
  incidents,
  incidentEvents,
  remediations,
  repositories,
  userSettings,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decryptOptional } from "@/lib/crypto";
import { makeGeminiClient } from "@/lib/gemini";
import { makeOctokit } from "@/lib/github";

export interface ScanResult {
  success: boolean;
  repositoryId: string;
  filesScanned: number;
  issuesFound: number;
  incidentIds: string[];
  errorMessage?: string;
}

export interface FileIssue {
  filename: string;
  severity: "critical" | "warning" | "info";
  issueType: string;
  description: string;
  suggestion: string;
  confidenceScore: number;
}

/**
 * Ask Gemini to list files worth scanning from a repo tree
 */
async function selectFilesToScan(
  genai: GoogleGenAI,
  fileTree: string[],
  repoName: string
): Promise<string[]> {
  if (fileTree.length === 0) return [];

  const prompt = `You are a senior SRE reviewing a GitHub repository called "${repoName}".

Here is the list of files in this repository:
${fileTree.slice(0, 200).join("\n")}

Select up to 10 files that are most likely to contain bugs, performance issues, memory leaks, 
infinite loops, CPU spikes, security vulnerabilities, or poor error handling.

Focus on: Python (.py), JavaScript (.js), TypeScript (.ts), Go (.go), Java (.java), 
C/C++ (.c, .cpp), Ruby (.rb) source files — NOT config files, docs, or test files.

Output ONLY the file paths, one per line. No explanations. No markdown. Just paths.`;

  const result = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const text = result.text ?? "";
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && l.includes("."));
}

/**
 * Ask Gemini to analyze a file for issues
 */
async function analyzeFile(
  genai: GoogleGenAI,
  filename: string,
  code: string,
  repoName: string
): Promise<FileIssue | null> {
  const prompt = `You are an expert SRE analyzing code for production issues.

Repository: ${repoName}
File: ${filename}

\`\`\`
${code.slice(0, 4000)}
\`\`\`

Analyze this code for:
1. Bugs that could cause crashes or incorrect behavior
2. Performance issues (infinite loops, memory leaks, CPU spikes, unbounded growth)
3. Security vulnerabilities (hardcoded secrets, SQL injection, unsafe eval)
4. Missing error handling that could cause silent failures
5. Resource leaks (unclosed files, connections, sockets)

If you find a REAL issue (not style/lint), respond with this exact JSON format:
{
  "has_issue": true,
  "severity": "critical" | "warning" | "info",
  "issue_type": "short category (e.g. Memory Leak, Infinite Loop, Unhandled Exception)",
  "description": "Clear 1-2 sentence description of the problem",
  "suggestion": "Clear 1-2 sentence suggestion for fixing it",
  "confidence": 0.0 to 1.0
}

If the code looks fine, respond with:
{ "has_issue": false }

Respond ONLY with the JSON. No other text.`;

  try {
    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = (result.text ?? "").trim();
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.has_issue) return null;

    return {
      filename,
      severity: parsed.severity ?? "warning",
      issueType: parsed.issue_type ?? "Code Issue",
      description: parsed.description ?? "Issue detected",
      suggestion: parsed.suggestion ?? "Review and fix",
      confidenceScore: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the file tree of a repository (up to 1000 files)
 */
async function fetchRepoTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<string[]> {
  try {
    const response = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "1",
    });

    return response.data.tree
      .filter((item) => item.type === "blob" && item.path)
      .map((item) => item.path!)
      .filter((path) => {
        // Only include source code files
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        return ["py", "js", "ts", "tsx", "jsx", "go", "java", "cpp", "c", "rb", "rs", "php"].includes(ext);
      })
      .slice(0, 500);
  } catch {
    return [];
  }
}

/**
 * Main scan function — called from the API route
 */
export async function scanRepository(
  userId: string,
  repositoryId: string
): Promise<ScanResult> {
  const incidentIds: string[] = [];

  try {
    // Load repository
    const repoRows = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, repositoryId), eq(repositories.userId, userId)))
      .limit(1);

    if (repoRows.length === 0) {
      return { success: false, repositoryId, filesScanned: 0, issuesFound: 0, incidentIds, errorMessage: "Repository not found" };
    }

    const repo = repoRows[0];

    // Load user settings
    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const settings = settingsRows[0];
    const githubToken = decryptOptional(settings?.githubAccessToken);
    const geminiKey = decryptOptional(settings?.geminiApiKey);

    if (!githubToken && !settings?.githubInstallationId) {
      return { success: false, repositoryId, filesScanned: 0, issuesFound: 0, incidentIds, errorMessage: "No GitHub credentials configured. Add a GitHub token in Settings." };
    }

    const octokit = makeOctokit({ token: githubToken, installationId: settings?.githubInstallationId });
    const genai = makeGeminiClient(geminiKey);
    const branch = repo.defaultBranch ?? "main";

    console.log(`[Scanner] Fetching file tree for ${repo.fullName}@${branch}`);

    // Step 1: Get file tree
    const allFiles = await fetchRepoTree(octokit, repo.owner, repo.name, branch);
    if (allFiles.length === 0) {
      return { success: false, repositoryId, filesScanned: 0, issuesFound: 0, incidentIds, errorMessage: "No source files found in repository or branch not accessible." };
    }

    console.log(`[Scanner] Found ${allFiles.length} source files`);

    // Step 2: Ask Gemini which files to scan
    const filesToScan = await selectFilesToScan(genai, allFiles, repo.fullName);
    const targetFiles = filesToScan.length > 0 ? filesToScan : allFiles.slice(0, 5);

    console.log(`[Scanner] Scanning ${targetFiles.length} files: ${targetFiles.join(", ")}`);

    let filesScanned = 0;
    let issuesFound = 0;

    // Step 3: Analyze each selected file
    for (const filePath of targetFiles.slice(0, 10)) {
      try {
        // Fetch file content
        const fileResponse = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: filePath,
          ref: branch,
        });

        const fileData = fileResponse.data;
        if (Array.isArray(fileData) || fileData.type !== "file" || !("content" in fileData)) continue;

        const code = Buffer.from(fileData.content, "base64").toString("utf-8");
        filesScanned++;

        // Analyze with Gemini
        const issue = await analyzeFile(genai, filePath, code, repo.fullName);
        if (!issue) continue;

        issuesFound++;
        console.log(`[Scanner] Issue found in ${filePath}: ${issue.issueType} (${issue.severity})`);

        // Create incident
        const title = `[AI Scan] ${issue.issueType} in ${filePath}`;
        const [incident] = await db
          .insert(incidents)
          .values({
            userId,
            probeId: "ai-scanner",
            repositoryId,
            severity: issue.severity === "critical" ? "critical" : "warning",
            status: "open",
            title,
            issueType: issue.issueType,
            stackTrace: null,
            affectedFile: filePath,
            aiConfidenceScore: issue.confidenceScore,
            aiReasoning: issue.description,
            aiPatchExplanation: issue.suggestion,
          })
          .returning({ id: incidents.id });

        incidentIds.push(incident.id);

        await db.insert(incidentEvents).values({
          incidentId: incident.id,
          eventType: "status_change",
          fromStatus: null,
          toStatus: "open",
          message: `AI scanner detected: ${issue.description}`,
          metadata: { filePath, issueType: issue.issueType, confidence: issue.confidenceScore },
        });

        // Auto-generate patch for critical issues
        if (issue.severity === "critical" && issue.confidenceScore > 0.65) {
          void autoGeneratePatch(
            userId,
            incident.id,
            filePath,
            code,
            fileData.sha,
            issue,
            repo,
            octokit,
            genai,
            branch,
            settings
          ).catch((err) => console.error(`[Scanner] Patch gen failed for ${filePath}:`, err));
        }
      } catch (fileErr) {
        console.error(`[Scanner] Could not analyze ${filePath}:`, fileErr);
      }
    }

    return {
      success: true,
      repositoryId,
      filesScanned,
      issuesFound,
      incidentIds,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Scanner] Fatal error:", msg);
    return { success: false, repositoryId, filesScanned: 0, issuesFound: 0, incidentIds, errorMessage: msg };
  }
}

/**
 * Auto-generate and optionally push a patch for a critical issue found during scanning
 */
async function autoGeneratePatch(
  userId: string,
  incidentId: string,
  filePath: string,
  originalCode: string,
  fileSha: string,
  issue: FileIssue,
  repo: { owner: string; name: string; fullName: string; defaultBranch: string | null },
  octokit: Octokit,
  genai: GoogleGenAI,
  branch: string,
  settings: { slackWebhookUrl?: string | null; discordWebhookUrl?: string | null } | undefined
): Promise<void> {
  const { generateCodePatch, calculateConfidenceScore } = await import("@/lib/gemini");

  // Update incident to analyzing
  await db.update(incidents).set({ status: "analyzing", updatedAt: new Date() }).where(eq(incidents.id, incidentId));
  await db.insert(incidentEvents).values({
    incidentId,
    eventType: "status_change",
    fromStatus: "open",
    toStatus: "analyzing",
    message: "AI generating patch for detected issue",
  });

  const patchResult = await generateCodePatch(genai, {
    originalCode,
    issueType: issue.issueType,
    cpuUsage: 0,
    memoryUsage: 0,
    stackTrace: `Issue found during proactive scan: ${issue.description}\nSuggestion: ${issue.suggestion}`,
    filename: filePath,
  });

  const confidenceScore = calculateConfidenceScore({
    hasStackTrace: true,
    stackTraceLength: issue.description.length,
    filenameExplicit: true,
    patchSize: patchResult.patchedCode.length,
    originalSize: originalCode.length,
  });

  // Create remediation record
  const [remediationRecord] = await db
    .insert(remediations)
    .values({
      incidentId,
      status: "pending_review",
      targetFile: filePath,
      originalCode,
      patchedCode: patchResult.patchedCode,
      confidenceScore,
      explanation: patchResult.explanation,
      rollbackNotes: patchResult.rollbackNotes,
      geminiModel: "gemini-2.5-flash",
    })
    .returning({ id: remediations.id });

  // Create branch and PR
  const { createBranch, commitFileToRepo, createPullRequest, buildPRBody } = await import("@/lib/github");
  const branchName = `aegis-scan-fix-${incidentId.slice(0, 8)}-${Date.now()}`;
  const defaultBranch = repo.defaultBranch ?? "main";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  await createBranch(octokit, repo.owner, repo.name, branchName, defaultBranch);
  await commitFileToRepo(
    octokit, repo.owner, repo.name, filePath,
    patchResult.patchedCode, fileSha,
    `fix(aegis-scan): ${issue.issueType} in ${filePath}`,
    branchName
  );

  const prBody = buildPRBody({
    incidentId,
    probeId: "ai-scanner",
    issueType: issue.issueType,
    cpuUsage: 0,
    memoryUsage: 0,
    targetFile: filePath,
    explanation: `**Found by AI Proactive Scan**\n\n${patchResult.explanation}`,
    appUrl,
  });

  const { url: prUrl, number: prNumber } = await createPullRequest(
    octokit, repo.owner, repo.name,
    {
      title: `🛡️ Aegis Scan Fix: ${issue.issueType} in ${filePath}`,
      body: prBody,
      head: branchName,
      base: defaultBranch,
    }
  );

  // Update records
  await db.update(remediations).set({ status: "success", prUrl, prNumber, branchName, completedAt: new Date() }).where(eq(remediations.id, remediationRecord.id));
  await db.update(incidents).set({
    status: "resolved", prUrl, prNumber, branchName,
    aiConfidenceScore: confidenceScore,
    updatedAt: new Date(), resolvedAt: new Date()
  }).where(eq(incidents.id, incidentId));

  await db.insert(incidentEvents).values({
    incidentId,
    eventType: "pr_created",
    fromStatus: "analyzing",
    toStatus: "resolved",
    message: `AI scan patch PR created: ${prUrl}`,
    metadata: { prUrl, prNumber, branchName },
  });

  console.log(`[Scanner] ✅ Auto-patch PR created: ${prUrl}`);
}
