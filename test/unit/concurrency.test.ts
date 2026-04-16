import { describe, expect, it } from "vitest";

import { mapWithConcurrency, resolveConcurrency } from "../../src/ingest/pipeline/concurrency";

describe("resolveConcurrency", () => {
  it("returns a positive integer when input is a positive finite number", () => {
    expect(resolveConcurrency(1)).toBe(1);
    expect(resolveConcurrency(4)).toBe(4);
    expect(resolveConcurrency(32)).toBe(32);
  });

  it("floors fractional positive inputs", () => {
    expect(resolveConcurrency(3.9)).toBe(3);
  });

  it("falls back to the default when input is missing, zero, negative, or non-finite", () => {
    const fallback = resolveConcurrency();
    expect(fallback).toBeGreaterThanOrEqual(1);
    expect(fallback).toBeLessThanOrEqual(8);

    expect(resolveConcurrency(0)).toBe(fallback);
    expect(resolveConcurrency(-2)).toBe(fallback);
    expect(resolveConcurrency(Number.NaN)).toBe(fallback);
    expect(resolveConcurrency(Number.POSITIVE_INFINITY)).toBe(fallback);
  });
});

describe("mapWithConcurrency", () => {
  it("returns an empty array for empty input without invoking the worker", async () => {
    let calls = 0;
    const result = await mapWithConcurrency<number, number>([], 4, async (value) => {
      calls += 1;
      return value;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("preserves input order regardless of completion order", async () => {
    const delays = [40, 5, 30, 10, 20];
    const result = await mapWithConcurrency(delays, 3, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return index;
    });
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("never runs more workers than the configured concurrency", async () => {
    const concurrency = 2;
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapWithConcurrency(items, concurrency, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value;
    });

    expect(peak).toBeLessThanOrEqual(concurrency);
  });

  it("clamps concurrency to the number of items", async () => {
    const items = [1, 2, 3];
    let active = 0;
    let peak = 0;

    const result = await mapWithConcurrency(items, 100, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 2;
    });

    expect(result).toEqual([2, 4, 6]);
    expect(peak).toBeLessThanOrEqual(items.length);
  });
});
