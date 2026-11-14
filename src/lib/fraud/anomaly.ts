/**
 * Simple, explainable anomaly checks on a new collection submission (PRD §18).
 * Deliberately rule-based, not ML: every flag has a plain-language reason an
 * operator or admin can act on. Flags never block a submission or reward —
 * they only surface it for human review. Thresholds are starting points to
 * tune once the pilot produces real data.
 */
export const ANOMALY_THRESHOLDS = {
  highWeightKg: 100, // a single submission above this is unusual for hand-carried litter
  maxSubmissionsPer24h: 5, // the 6th submission within 24h gets flagged
  duplicateWindowMinutes: 60, // same point + material + weight within this window
} as const;

export type AnomalyCode = "HIGH_WEIGHT" | "HIGH_FREQUENCY" | "POSSIBLE_DUPLICATE";

export interface RecentSubmission {
  createdAt: Date;
  collectionPointId: string;
  wasteCategoryId: string;
  submittedWeightKg: number;
}

export interface AnomalyInput {
  now: Date;
  collectionPointId: string;
  wasteCategoryId: string;
  submittedWeightKg: number;
  /** This participant's own earlier submissions (any status), newest data only needs to cover the last 24h. */
  recent: RecentSubmission[];
}

export function detectAnomalies(input: AnomalyInput): AnomalyCode[] {
  const t = ANOMALY_THRESHOLDS;
  const codes: AnomalyCode[] = [];

  if (input.submittedWeightKg > t.highWeightKg) codes.push("HIGH_WEIGHT");

  const dayAgo = input.now.getTime() - 24 * 60 * 60 * 1000;
  const last24h = input.recent.filter((r) => r.createdAt.getTime() >= dayAgo);
  if (last24h.length >= t.maxSubmissionsPer24h) codes.push("HIGH_FREQUENCY");

  const windowStart = input.now.getTime() - t.duplicateWindowMinutes * 60 * 1000;
  const duplicate = input.recent.some(
    (r) =>
      r.createdAt.getTime() >= windowStart &&
      r.collectionPointId === input.collectionPointId &&
      r.wasteCategoryId === input.wasteCategoryId &&
      r.submittedWeightKg === input.submittedWeightKg
  );
  if (duplicate) codes.push("POSSIBLE_DUPLICATE");

  return codes;
}
