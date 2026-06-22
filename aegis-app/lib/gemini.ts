import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are Aegis, an elite Site Reliability Engineer AI. 
You will receive a buggy code file causing a CPU or Memory spike. 
Find the root cause and fix it.
OUTPUT ONLY THE RAW, CORRECTED CODE. Do not include markdown formatting like \`\`\`python.
Do not explain the fix. Just the raw code.`;

export function makeGeminiClient(geminiKey?: string | null): GoogleGenAI {
  const key = geminiKey ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "No Gemini API key available (neither per-user nor global GEMINI_API_KEY)"
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

export async function extractFilenameFromStackTrace(
  genai: GoogleGenAI,
  stackTrace: string
): Promise<string> {
  const prompt = `Analyze this server stack trace. Output ONLY the exact filename that caused the crash (e.g., filename.py). Do not output any other text or explanation.\n\nStack Trace:\n${stackTrace}`;

  const result = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const text = result.text ?? "";
  // Take only the basename in case Gemini returns a full path
  const filename = text.trim().split("/").pop()?.split("\\").pop() ?? text.trim();
  // Remove any markdown artifacts
  return filename.replace(/[`'"*]/g, "").trim();
}

export async function generateCodePatch(
  genai: GoogleGenAI,
  options: {
    originalCode: string;
    issueType: string;
    cpuUsage: number;
    memoryUsage: number;
    stackTrace?: string;
    filename: string;
  }
): Promise<{ patchedCode: string; explanation: string; rollbackNotes: string }> {
  const fixPrompt = `System Report: ${options.issueType}. CPU is at ${options.cpuUsage}% and Memory is at ${options.memoryUsage}%.
File: ${options.filename}
${options.stackTrace ? `Stack Trace:\n${options.stackTrace}\n\n` : ""}
Fix this code that is causing the issue. Return ONLY the raw corrected code:

${options.originalCode}`;

  const explanationPrompt = `You are an SRE explaining a code fix to a developer.
File: ${options.filename}
Issue: ${options.issueType}
CPU: ${options.cpuUsage}%, Memory: ${options.memoryUsage}%

Original code (problematic):
${options.originalCode.slice(0, 2000)}

Provide a brief technical explanation (2-3 sentences) of what was wrong and how to fix it. Be specific.`;

  const [patchResult, explanationResult] = await Promise.all([
    genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fixPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    }),
    genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: explanationPrompt,
    }),
  ]);

  const patchedCode = sanitizeGeminiOutput(patchResult.text ?? "");
  const explanation = explanationResult.text?.trim() ?? "AI analysis complete.";

  const rollbackNotes = `To rollback: revert commit on branch and close this PR. Original code is preserved in the incident record. File: ${options.filename}`;

  return { patchedCode, explanation, rollbackNotes };
}

function sanitizeGeminiOutput(text: string): string {
  if (!text) return text;
  let result = text.trim();
  // Remove opening code fence with optional language tag
  result = result.replace(/^```[a-zA-Z0-9_+-]*\n?/, "");
  // Remove closing code fence
  result = result.replace(/\n?```\s*$/, "");
  return result.trim();
}

export function calculateConfidenceScore(params: {
  hasStackTrace: boolean;
  stackTraceLength: number;
  filenameExplicit: boolean;
  patchSize: number;
  originalSize: number;
}): number {
  let score = 0.5; // base

  // Stack trace quality
  if (params.hasStackTrace && params.stackTraceLength > 50) score += 0.15;
  if (params.hasStackTrace && params.stackTraceLength > 200) score += 0.1;

  // Filename confidence
  if (params.filenameExplicit) score += 0.1;

  // Patch relative size (surgical patches score higher)
  if (params.originalSize > 0) {
    const changeRatio = params.patchSize / params.originalSize;
    if (changeRatio < 0.2) score += 0.1; // surgical
    else if (changeRatio > 0.8) score -= 0.15; // rewrote whole file
  }

  return Math.min(0.98, Math.max(0.1, score));
}
