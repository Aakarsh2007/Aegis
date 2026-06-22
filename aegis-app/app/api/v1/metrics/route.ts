/**
 * Backward-compatible route for the C++ probe.
 * Accepts the same payload as the old Express /api/v1/metrics endpoint.
 * Delegates to the probe webhook handler.
 */
export { POST } from "@/app/api/webhooks/probe/route";
