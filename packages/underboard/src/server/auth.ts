import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import consola from "consola";

const UNDERBOARD_DIR = path.join(os.homedir(), ".underboard");
const TOKEN_FILE = path.join(UNDERBOARD_DIR, "token");

let cachedToken: string | null = null;

export async function getOrCreateToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  await fs.mkdir(UNDERBOARD_DIR, { recursive: true });

  try {
    const existing = await fs.readFile(TOKEN_FILE, "utf-8");
    cachedToken = existing.trim();
    return cachedToken;
  } catch {
    // Token doesn't exist, create new one
  }

  const token = crypto.randomBytes(32).toString("hex");
  await fs.writeFile(TOKEN_FILE, token, "utf-8");

  try {
    await fs.chmod(TOKEN_FILE, 0o600);
  } catch {
    // Windows: chmod not supported the same way, rely on ACL
    consola.info("Could not set POSIX permissions on token file (expected on Windows)");
  }

  consola.success("Generated new bearer token at", TOKEN_FILE);
  cachedToken = token;
  return token;
}

export function validateBearerToken(authHeader: string | undefined, expectedToken: string): boolean {
  if (!authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const token = match[1];
  if (!token || token.length !== expectedToken.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
}
