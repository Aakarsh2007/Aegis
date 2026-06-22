/**
 * Per-probe metrics endpoint: POST /api/probes/:probeId/metrics
 * Delegates to the main webhook handler.
 */
export { POST } from "@/app/api/webhooks/probe/route";
