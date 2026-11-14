import { describe, it, expect } from "vitest";
import { detectAnomalies, ANOMALY_THRESHOLDS } from "./anomaly";

const now = new Date("2026-11-14T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);
const base = { now, collectionPointId: "cp1", wasteCategoryId: "pet", submittedWeightKg: 5 };
const sub = (m: number, over: Partial<{ collectionPointId: string; wasteCategoryId: string; submittedWeightKg: number }> = {}) => ({
  createdAt: minutesAgo(m),
  collectionPointId: "cp1",
  wasteCategoryId: "pet",
  submittedWeightKg: 3,
  ...over,
});

describe("detectAnomalies", () => {
  it("returns nothing for a normal first submission", () => {
    expect(detectAnomalies({ ...base, recent: [] })).toEqual([]);
  });

  it("flags HIGH_WEIGHT only above the threshold", () => {
    expect(detectAnomalies({ ...base, submittedWeightKg: ANOMALY_THRESHOLDS.highWeightKg, recent: [] })).toEqual([]);
    expect(detectAnomalies({ ...base, submittedWeightKg: ANOMALY_THRESHOLDS.highWeightKg + 1, recent: [] })).toContain("HIGH_WEIGHT");
  });

  it("flags HIGH_FREQUENCY on the 6th submission within 24h, not the 5th", () => {
    const four = [10, 100, 200, 300].map((m) => sub(m));
    const five = [10, 100, 200, 300, 400].map((m) => sub(m));
    expect(detectAnomalies({ ...base, recent: four })).not.toContain("HIGH_FREQUENCY");
    expect(detectAnomalies({ ...base, recent: five })).toContain("HIGH_FREQUENCY");
  });

  it("ignores submissions older than 24h for frequency", () => {
    const old = [1500, 1600, 1700, 1800, 1900].map((m) => sub(m));
    expect(detectAnomalies({ ...base, recent: old })).not.toContain("HIGH_FREQUENCY");
  });

  it("flags POSSIBLE_DUPLICATE for same point, material and weight inside the window", () => {
    expect(detectAnomalies({ ...base, recent: [sub(30, { submittedWeightKg: 5 })] })).toContain("POSSIBLE_DUPLICATE");
  });

  it("does not flag a duplicate when weight, material, point or timing differ", () => {
    expect(detectAnomalies({ ...base, recent: [sub(30, { submittedWeightKg: 6 })] })).not.toContain("POSSIBLE_DUPLICATE");
    expect(detectAnomalies({ ...base, recent: [sub(30, { wasteCategoryId: "hdpe", submittedWeightKg: 5 })] })).not.toContain("POSSIBLE_DUPLICATE");
    expect(detectAnomalies({ ...base, recent: [sub(30, { collectionPointId: "cp2", submittedWeightKg: 5 })] })).not.toContain("POSSIBLE_DUPLICATE");
    expect(detectAnomalies({ ...base, recent: [sub(90, { submittedWeightKg: 5 })] })).not.toContain("POSSIBLE_DUPLICATE");
  });

  it("can raise several flags at once", () => {
    const recent = [10, 100, 200, 300, 400].map((m) => sub(m, { submittedWeightKg: 150 }));
    const codes = detectAnomalies({ ...base, submittedWeightKg: 150, recent });
    expect(codes).toEqual(expect.arrayContaining(["HIGH_WEIGHT", "HIGH_FREQUENCY", "POSSIBLE_DUPLICATE"]));
  });
});
