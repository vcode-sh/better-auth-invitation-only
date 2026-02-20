import { APIError } from "better-auth/api";
import { PENDING_MAX_SIZE, PENDING_TTL_MS } from "./constants";
import type { InviteStore, InviteStoreEntry } from "./types";

/**
 * Default in-memory invite store backed by a Map.
 * Suitable for single-process deployments only.
 */
export class MemoryInviteStore implements InviteStore {
  private readonly map = new Map<string, InviteStoreEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  get(key: string): InviteStoreEntry | null {
    return this.map.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: InviteStoreEntry): void {
    this.map.set(key, value);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (now - entry.createdAt > PENDING_TTL_MS) {
        this.map.delete(key);
      }
    }
  }

  get size(): number {
    return this.map.size;
  }

  /**
   * Throws TOO_MANY_REQUESTS if the store is at capacity and cleanup
   * cannot free enough space.
   */
  ensureCapacity(): void {
    if (this.map.size >= PENDING_MAX_SIZE) {
      this.cleanup();
      if (this.map.size >= PENDING_MAX_SIZE) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: "Too many pending signups. Please try again later.",
        });
      }
    }
  }

  /** Expose internal map for test introspection. */
  get __map(): Map<string, InviteStoreEntry> {
    return this.map;
  }

  startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return;
    }
    if (typeof setInterval === "undefined") {
      return;
    }
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    if (
      typeof this.cleanupInterval === "object" &&
      "unref" in this.cleanupInterval
    ) {
      this.cleanupInterval.unref();
    }
  }
}
