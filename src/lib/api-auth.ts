import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";

/**
 * Result of authentication validation
 */
export interface AuthResult {
  valid: boolean;
  userId?: string;
  authMethod?: "api-key" | "session";
  error?: string;
}

/**
 * Validates request via API key OR session.
 *
 * Authentication methods (checked in order):
 * 1. API Key: Authorization: Bearer <RAGSTER_API_KEY>
 * 2. Session: NextAuth session cookie
 *
 * MODULAR DESIGN:
 * - Endpoints call validateRequest() and trust the result
 * - To switch to per-user API keys later, only change validateApiKey()
 * - See docs/API-KEY-IMPLEMENTATION.md for migration guide
 */
export async function validateRequest(req: NextRequest): Promise<AuthResult> {
  // Check API key first (for external apps)
  const authHeader = req.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7).trim();
    return validateApiKey(apiKey);
  }

  // Fallback to session auth (for web app)
  return validateSession();
}

/**
 * Validate API key - STATIC approach (single key from .env)
 *
 * FUTURE: Replace this implementation with MongoDB lookup
 * to support per-user API keys. Interface stays the same.
 *
 * Example future implementation:
 *   const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
 *   const keyDoc = await db.collection("api_keys").findOne({ keyHash });
 *   return keyDoc ? { valid: true, userId: keyDoc.userId, authMethod: "api-key" } : { valid: false };
 */
async function validateApiKey(apiKey: string): Promise<AuthResult> {
  const validKey = process.env.RAGSTER_API_KEY;

  if (!validKey) {
    return { valid: false, error: "API key not configured on server" };
  }

  // Timing-safe comparison to prevent timing attacks
  const a = Buffer.from(apiKey);
  const b = Buffer.from(validKey);
  const isValid = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (isValid) {
    return {
      valid: true,
      userId: "api-client", // FUTURE: Return actual userId from DB
      authMethod: "api-key",
    };
  }

  return { valid: false, error: "Invalid API key" };
}

/**
 * Validate session via NextAuth
 */
async function validateSession(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    return {
      valid: true,
      userId: session.user.id,
      authMethod: "session",
    };
  }

  return { valid: false, error: "Unauthorized - provide Bearer token or login" };
}
