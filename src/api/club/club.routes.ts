import { http } from "../http";

/** Time do evento. `canChange`: sem time ainda ou troca única não usada. */
export type MyClub = { club: string | null; canChange: boolean };

export async function getMyClub() {
  const { data } = await http.get<{ data: MyClub }>("/club/me");
  return data.data;
}

/** Escolher ou trocar. Mesmo time = sem efeito; troca já usada = 409. */
export async function chooseClub(club: string) {
  const { data } = await http.put<{ data: MyClub }>("/club/me", { club });
  return data.data;
}

/** Time do dono do edifício (admin em edifício alheio: telão usa as imagens dele). */
export async function getDonationClub(donationId: number) {
  const { data } = await http.get<{ data: { club: string | null } }>(`/club/donation/${donationId}`);
  return data.data.club;
}
