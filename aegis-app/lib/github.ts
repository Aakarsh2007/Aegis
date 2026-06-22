import { Octokit } from "@octokit/rest";

export function makeOctokit(githubToken: string): Octokit {
  return new Octokit({ auth: githubToken });
}

export async function fetchFileFromRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  branch?: string
): Promise<{ content: string; sha: string; encoding: string }> {
  const response = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ...(branch ? { ref: branch } : {}),
  });

  const data = response.data;

  if (Array.isArray(data)) {
    throw new Error(`Path ${path} is a directory, not a file`);
  }

  if (data.type !== "file") {
    throw new Error(`Path ${path} is not a file (type: ${data.type})`);
  }

  if (!("content" in data) || !data.content) {
    throw new Error(`File ${path} has no content`);
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha, encoding: data.encoding };
}

export async function createBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  baseBranch: string = "main"
): Promise<void> {
  // Get the SHA of the base branch
  const baseRef = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseRef.data.object.sha,
  });
}

export async function commitFileToRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string,
  message: string,
  branch: string
): Promise<void> {
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    sha,
    branch,
  });
}

export async function createPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: {
    title: string;
    body: string;
    head: string;
    base: string;
  }
): Promise<{ url: string; number: number }> {
  const pr = await octokit.pulls.create({
    owner,
    repo,
    title: options.title,
    body: options.body,
    head: options.head,
    base: options.base,
  });

  return { url: pr.data.html_url, number: pr.data.number };
}

export function buildPRBody(params: {
  incidentId: string;
  probeId: string;
  issueType: string;
  cpuUsage: number;
  memoryUsage: number;
  targetFile: string;
  explanation: string;
  appUrl: string;
}): string {
  return `### 🛡️ Aegis Autonomous Remediation

**Incident ID:** \`${params.incidentId}\`  
**Probe:** \`${params.probeId}\`  
**Issue:** ${params.issueType}  
**CPU:** ${params.cpuUsage.toFixed(1)}% | **Memory:** ${params.memoryUsage.toFixed(1)}%  

#### What was fixed
The AI analyzed the stack trace, isolated the fault to \`${params.targetFile}\`, and generated this patch automatically.

#### Analysis
${params.explanation}

#### Review checklist
- [ ] The patch addresses the root cause described above
- [ ] No unintended behavior changes
- [ ] Tests pass
- [ ] Safe to merge to production

> ⚠️ Always review AI-generated patches before merging. This PR was created automatically by [Aegis Cloud Platform](${params.appUrl}).`;
}
