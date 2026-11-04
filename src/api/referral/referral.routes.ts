import { http } from "../http";
import type {
  ApplyReferralResult,
  ReferrerPreview,
  ReferralSummary,
} from "./referral.types";

export async function getReferralPreview(code: string, signal?: AbortSignal) {
  const { data } = await http.get<{ data: ReferrerPreview }>(
    `/referral/preview/${encodeURIComponent(code)}`,
    { signal },
  );
  return data.data;
}

/** Link com o endereço aberto (o do back vem de `APP_PUBLIC_URL`, `localhost` em dev): na rede local sai o IP. */
export async function getMyReferralSummary() {
  const { data } = await http.get<{ data: ReferralSummary }>("/referral/me");
  const link = new URL(data.data.link);
  return { ...data.data, link: `${window.location.origin}/${link.search}` };
}

export async function applyMyReferral(code: string) {
  const { data } = await http.post<{ data: ApplyReferralResult }>("/referral/me", { code });
  return data.data;
}
