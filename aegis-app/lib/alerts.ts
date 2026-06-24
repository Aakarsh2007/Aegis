/**
 * Alert delivery: Slack, Discord, webhook notifications on incident events.
 */

interface AlertParams {
  incidentId: string;
  title: string;
  severity: "critical" | "warning" | "info";
  probeId: string;
  issueType: string;
  dashboardUrl: string;
  slackWebhookUrl?: string | null;
  discordWebhookUrl?: string | null;
  webhookUrl?: string | null;
  prUrl?: string | null;
}

export async function sendAlerts(params: AlertParams): Promise<void> {
  const promises: Promise<void>[] = [];

  if (params.slackWebhookUrl) {
    promises.push(sendSlackAlert(params));
  }
  if (params.discordWebhookUrl) {
    promises.push(sendDiscordAlert(params));
  }
  if (params.webhookUrl) {
    promises.push(sendWebhookAlert(params));
  }

  // Fire all alerts concurrently; failures are logged but don't block the caller
  const results = await Promise.allSettled(promises);
  results.forEach((r) => {
    if (r.status === "rejected") {
      console.error("[Alerts] Delivery failed:", r.reason);
    }
  });
}

async function sendSlackAlert(params: AlertParams): Promise<void> {
  if (!params.slackWebhookUrl) return;

  const color = params.severity === "critical" ? "#ef4444" : "#f59e0b";
  const emoji = params.severity === "critical" ? "🚨" : "⚠️";

  const body = {
    attachments: [
      {
        color,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *Aegis Alert: ${params.title}*`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Severity:*\n${params.severity.toUpperCase()}` },
              { type: "mrkdwn", text: `*Probe:*\n${params.probeId}` },
              { type: "mrkdwn", text: `*Issue:*\n${params.issueType}` },
              { type: "mrkdwn", text: `*Incident ID:*\n\`${params.incidentId.slice(0, 8)}\`` },
            ],
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Incident" },
                url: `${params.dashboardUrl}/incidents/${params.incidentId}`,
                style: params.severity === "critical" ? "danger" : "primary",
              },
              ...(params.prUrl
                ? [{ type: "button", text: { type: "plain_text", text: "View AI Patch" }, url: params.prUrl }]
                : []),
            ],
          },
        ],
      },
    ],
  };

  const res = await fetch(params.slackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Slack returned ${res.status}`);
  }
}

async function sendDiscordAlert(params: AlertParams): Promise<void> {
  if (!params.discordWebhookUrl) return;

  const color = params.severity === "critical" ? 0xef4444 : 0xf59e0b;
  const emoji = params.severity === "critical" ? "🚨" : "⚠️";

  const body = {
    embeds: [
      {
        title: `${emoji} Aegis Alert: ${params.title}`,
        color,
        fields: [
          { name: "Severity", value: params.severity.toUpperCase(), inline: true },
          { name: "Probe", value: params.probeId, inline: true },
          { name: "Issue", value: params.issueType, inline: false },
        ],
        url: `${params.dashboardUrl}/incidents/${params.incidentId}`,
        footer: { text: "Aegis Autonomous SRE Platform" },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(params.discordWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Discord returned ${res.status}`);
  }
}

async function sendWebhookAlert(params: AlertParams): Promise<void> {
  if (!params.webhookUrl) return;

  const body = {
    event: params.prUrl ? "incident.resolved" : "incident.created",
    severity: params.severity,
    incidentId: params.incidentId,
    probeId: params.probeId,
    issueType: params.issueType,
    dashboardUrl: `${params.dashboardUrl}/incidents/${params.incidentId}`,
    prUrl: params.prUrl ?? null,
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(params.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status}`);
  }
}
