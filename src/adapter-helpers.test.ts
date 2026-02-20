import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetCountWarning, safeCount } from "./adapter-helpers";

describe("safeCount", () => {
  beforeEach(() => {
    _resetCountWarning();
  });

  it("returns number directly when adapter.count() returns a number", async () => {
    const adapter = { count: vi.fn().mockResolvedValue(42) };
    expect(await safeCount(adapter, { model: "invitation" })).toBe(42);
  });

  it("returns count from { count: N } object", async () => {
    const adapter = { count: vi.fn().mockResolvedValue({ count: 7 }) };
    expect(await safeCount(adapter, { model: "invitation" })).toBe(7);
  });

  it("falls back to findMany + length when count() throws", async () => {
    const adapter = {
      count: vi.fn().mockRejectedValue(new Error("not supported")),
      findMany: vi.fn().mockResolvedValue([{ id: "1" }, { id: "2" }]),
    };
    expect(await safeCount(adapter, { model: "invitation" })).toBe(2);
    expect(adapter.findMany).toHaveBeenCalledWith({
      model: "invitation",
      where: undefined,
    });
  });

  it("falls back when count() returns unexpected type (string)", async () => {
    const adapter = {
      count: vi.fn().mockResolvedValue("bad"),
      findMany: vi.fn().mockResolvedValue([{ id: "1" }]),
    };
    expect(await safeCount(adapter, { model: "invitation" })).toBe(1);
  });

  it("falls back when count() returns null", async () => {
    const adapter = {
      count: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    };
    expect(await safeCount(adapter, { model: "invitation" })).toBe(0);
  });

  it("returns 0 when fallback findMany returns non-array", async () => {
    const adapter = {
      count: vi.fn().mockRejectedValue(new Error("nope")),
      findMany: vi.fn().mockResolvedValue(null),
    };
    expect(await safeCount(adapter, { model: "invitation" })).toBe(0);
  });

  it("passes where clause to both count and findMany fallback", async () => {
    const where = [{ field: "usedAt", operator: "ne", value: null }];
    const adapter = {
      count: vi.fn().mockRejectedValue(new Error("nope")),
      findMany: vi.fn().mockResolvedValue([]),
    };
    await safeCount(adapter, { model: "invitation", where });
    expect(adapter.count).toHaveBeenCalledWith({ model: "invitation", where });
    expect(adapter.findMany).toHaveBeenCalledWith({
      model: "invitation",
      where,
    });
  });

  it("logs warning on first fallback only", async () => {
    const logger = { warn: vi.fn() };
    const adapter = {
      count: vi.fn().mockRejectedValue(new Error("nope")),
      findMany: vi.fn().mockResolvedValue([]),
    };
    await safeCount(adapter, { model: "invitation" }, logger);
    await safeCount(adapter, { model: "invitation" }, logger);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain("adapter.count()");
  });

  it("works without a logger", async () => {
    const adapter = {
      count: vi.fn().mockRejectedValue(new Error("nope")),
      findMany: vi.fn().mockResolvedValue([{ id: "1" }]),
    };
    expect(await safeCount(adapter, { model: "invitation" })).toBe(1);
  });

  it("returns 0 for count() returning 0", async () => {
    const adapter = { count: vi.fn().mockResolvedValue(0) };
    expect(await safeCount(adapter, { model: "invitation" })).toBe(0);
  });

  it("returns count from { count: 0 } object", async () => {
    const adapter = { count: vi.fn().mockResolvedValue({ count: 0 }) };
    expect(await safeCount(adapter, { model: "invitation" })).toBe(0);
  });
});
