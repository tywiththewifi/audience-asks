import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const memory = new Map<string, { at: number; value: unknown }>();

function dir() {
  return process.env.CACHE_DIR ?? path.join(tmpdir(), "audience-asks-cache");
}

export function cacheKey(...parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

/**
 * Two-level cache: process memory first, then JSON files on disk.
 * On Vercel the disk is /tmp, so it only survives while the instance is warm.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  if (process.env.NO_CACHE === "1") return { value: await load(), hit: false };
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && now - mem.at < ttlMs) return { value: mem.value as T, hit: true };

  const file = path.join(dir(), `${key}.json`);
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { at: number; value: T };
    if (now - raw.at < ttlMs) {
      memory.set(key, raw);
      return { value: raw.value, hit: true };
    }
  } catch {
    // missing or unreadable: fall through and load
  }

  const value = await load();
  const entry = { at: now, value };
  memory.set(key, entry);
  try {
    await mkdir(dir(), { recursive: true });
    await writeFile(file, JSON.stringify(entry));
  } catch {
    // a read-only disk only costs us the second cache level
  }
  return { value, hit: false };
}

export const TTL = { day: DAY_MS };
