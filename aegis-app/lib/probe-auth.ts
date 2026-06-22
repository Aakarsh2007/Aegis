import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Generate a new API key for a probe.
 * Returns the plaintext key (shown once) and hash/prefix for storage.
 */
export function generateApiKey(): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  const key = "aegis_" + randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(key).digest("hex");
  const keyPrefix = key.substring(0, 12);
  return { key, keyHash, keyPrefix };
}

/**
 * Validate a probe API key from an Authorization: Bearer <key> header.
 * Returns the userId if valid, null otherwise.
 */
export async function validateProbeApiKey(
  authHeader: string | null | undefined
): Promise<{ userId: string; keyId: string } | null> {
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const rawKey = match[1].trim();
  if (!rawKey) return null;

  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const rows = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (rows.length === 0) return null;

  const { id: keyId, userId } = rows[0];

  // Update last used (fire-and-forget)
  void db
    .update(apiKeys)
    .set({ lastUsed: new Date() })
    .where(eq(apiKeys.id, keyId))
    .catch((err) => console.error("Failed to update lastUsed:", err));

  return { userId, keyId };
}
