interface AlertParams {
  incidentId: string;
  title: string;
  severity: string;
  probeId: string;
  issueType: string;
  dashboardUrl: string;
  slackWebhookUrl?: string | null;
  discordWebhookUrl?: string | null;
}

export async function sendAlerts(params: AlertParams): Promise<void> {
  const {
    incidentId,
    title,
    severity,
    probeId,
    issueType,
    dashboardUrl,
    slackWebhookUrl,
    discordWebhookUrl,
  } = params;

  const incidentUrl = `${dashboardUrl}/incidents/${incidentId}`;

  // 1. Send Slack Alert
  if (slackWebhookUrl) {
    try {
      const payload = {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🚨 *New Incident Detected by Aegis Probe*`,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Issue:* ${issueType}`,
              },
              {
                type: "mrkdwn",
                text: `*Severity:* \`${severity.toUpperCase()}\``,
              },
              {
                type: "mrkdwn",
                text: `*Probe:* \`${probeId}\``,
              },
              {
                type: "mrkdwn",
                text: `*Incident ID:* \`${incidentId.slice(0, 8)}\``,
              },
            ],
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Review AI Patch & Approve",
                  emoji: true,
                },
                value: incidentId,
                url: incidentUrl,
                style: "primary",
              },
            ],
          },
        ],
      };

      await fetch(slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log(`[Alerts] Slack notification sent for incident ${incidentId}`);
    } catch (err) {
      console.error("[Alerts] Failed to send Slack notification:", err);
    }
  }

  // 2. Send Discord Alert
  if (discordWebhookUrl) {
    try {
      const color = severity === "critical" ? 15158332 : 15105570; // Red or Orange
      const payload = {
        embeds: [
          {
            title: `🛡️ Aegis Incident Alert: ${issueType}`,
            description: `Aegis has detected a system issue and generated a proposed code patch.`,
            url: incidentUrl,
            color: color,
            fields: [
              {
                name: "Severity",
                value: severity.toUpperCase(),
                inline: true,
              },
              {
                name: "Probe ID",
                value: probeId,
                inline: true,
              },
              {
                name: "Incident ID",
                value: incidentId,
                inline: true,
              },
            ],
            footer: {
              text: "Aegis Autonomous SRE Platform",
            },
            timestamp: new Date().toISOString(),
          },
        ],
      };

      await fetch(discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log(`[Alerts] Discord notification sent for incident ${incidentId}`);
    } catch (err) {
      console.error("[Alerts] Failed to send Discord notification:", err);
    }
  }
}
