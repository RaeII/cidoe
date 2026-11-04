import { describe, expect, test } from "bun:test";
import {
  getReferralStatus,
  normalizeReferralCode,
} from "../src/api/referral/referral.logic";
import type { ReferralSummary } from "../src/api/referral/referral.types";

const summary: ReferralSummary = {
  code: "A1B2C3D4E5F60718",
  link: "https://cidoe.com.br/?ref=A1B2C3D4E5F60718",
  referral_count: 0,
  can_apply_referral: true,
  apply_deadline: "2026-08-20T12:00:00.000Z",
  referrer: null,
};

describe("fluxo de indicação", () => {
  test("normaliza código recebido pelo link", () => {
    expect(normalizeReferralCode(" a1b2c3d4e5f60718 ")).toBe("A1B2C3D4E5F60718");
  });

  test("distingue confirmação, vínculo existente e prazo expirado", () => {
    expect(getReferralStatus(summary, "B1B2C3D4E5F60718")).toBe("confirm");
    expect(
      getReferralStatus(
        { ...summary, can_apply_referral: false, referrer: { name: "Ana", profile_image: null } },
        "B1B2C3D4E5F60718",
      ),
    ).toBe("linked");
    expect(getReferralStatus({ ...summary, can_apply_referral: false }, "B1B2C3D4E5F60718")).toBe("expired");
    expect(getReferralStatus(summary, summary.code)).toBe("self");
  });
});
