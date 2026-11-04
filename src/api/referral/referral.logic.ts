import type { ReferralSummary } from "./referral.types";

export const REFERRAL_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase();
}

export function getReferralStatus(
  summary: ReferralSummary,
  pendingCode: string,
): "confirm" | "linked" | "expired" | "self" {
  if (summary.referrer) return "linked";
  if (summary.code === pendingCode) return "self";
  return summary.can_apply_referral ? "confirm" : "expired";
}
