/**
 * Minimum adapter contract for invite-only plugin:
 *
 * Required methods: create, findOne, findMany, update, delete
 * Optional methods: count (falls back to findMany + length)
 *
 * Where operators used: eq (implicit), ne, lt, gt
 * findMany options: sortBy, limit
 */

let hasWarnedCountFallback = false;

/**
 * Safe count with fallback to findMany + length when adapter doesn't support count().
 * Logs a performance warning on first fallback use.
 */
export async function safeCount(
  adapter: any,
  params: { model: string; where?: any[] },
  logger?: any
): Promise<number> {
  try {
    const result = await adapter.count(params);
    if (typeof result === "number") {
      return result;
    }
    if (result && typeof result.count === "number") {
      return result.count;
    }
    throw new Error("Unexpected count result");
  } catch {
    if (!hasWarnedCountFallback) {
      logger?.warn?.(
        "invite-only: adapter.count() not supported, falling back to findMany. This may impact performance with large datasets."
      );
      hasWarnedCountFallback = true;
    }
    const items = await adapter.findMany({
      model: params.model,
      where: params.where,
    });
    return Array.isArray(items) ? items.length : 0;
  }
}

/** Reset the warning flag (for testing). */
export function _resetCountWarning(): void {
  hasWarnedCountFallback = false;
}
