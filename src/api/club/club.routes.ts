import { http } from "../http";

/** Time do evento. `canChange`: sem time ainda ou troca única não usada. */
export type MyClub = { club: string | null; canChange: boolean };

/** Imagem do telão: `key` ("<slug>/<n>") é o que o edifício grava. */
export type ClubImage = { key: string; url: string };

/** Time do catálogo. Inativo: fora da lista e do link; quem já torce mantém as imagens. `nickname` null = sem apelido. */
export type ClubCatalogEntry = { slug: string; name: string; nickname: string | null; isActive: boolean; thumbUrl: string; images: ClubImage[] };

/** `isActive` = evento ligado. Só times com imagem. */
export type ClubCatalog = { isActive: boolean; clubs: ClubCatalogEntry[] };

export async function getClubCatalog() {
  const { data } = await http.get<{ data: ClubCatalog }>("/club/catalog");
  return data.data;
}

export async function getMyClub() {
  const { data } = await http.get<{ data: MyClub }>("/club/me");
  return data.data;
}

/** Escolher ou trocar. Mesmo time = sem efeito; troca já usada = 409; evento desligado = 403. */
export async function chooseClub(club: string) {
  const { data } = await http.put<{ data: MyClub }>("/club/me", { club });
  return data.data;
}
