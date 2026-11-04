export interface ReferrerPreview {
  name: string | null;
  profile_image: string | null;
}

export interface ReferralSummary {
  code: string;
  link: string;
  referral_count: number;
  can_apply_referral: boolean;
  apply_deadline: string;
  referrer: ReferrerPreview | null;
}

export interface ApplyReferralResult {
  referrer: ReferrerPreview;
}
