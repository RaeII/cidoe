import { http } from "./http";
import { saveLocalCustomization } from "../lib/prelaunchCity";
import type { BuildingCustomization } from "../scene/types";

export type DonationRecord = {
  id: number;
  value: number;
  cityId: number;
  ongId: number;
  ongIds: number[];
};

export type City = { id: number; name: string; uf: string };
export type Ong = { id: number; name: string; profile_image?: string | null };

export type DonationDataset = {
  donations: DonationRecord[];
  cities: City[];
  ongs: Ong[];
  total: number;
  /** Personalizações salvas, só dos edifícios que têm uma. */
  customizations: Map<number, BuildingCustomization>;
};

export type DonationLoadProgress = {
  loadedBytes: number;
  totalBytes: number | null;
};

/** Contrato do GET /donation/snapshot (formato compacto por tuplas). */
type SnapshotPayload = {
  v: number;
  total: number;
  cities: [number, string, string][];
  ongs: [number, string, (string | null)?][];
  data: [number, number, number, number][];
  custom?: [number, BuildingCustomization][];
  beneficiaries?: [number, number[]][];
};

type CustomizationsPayload = [number, BuildingCustomization][];

/**
 * Busca o snapshot cacheado e, em paralelo, as personalizações atuais sem cache.
 *
 * Progresso: com Content-Encoding gzip o browser zera ProgressEvent.total e
 * `loaded` conta bytes DESCOMPRIMIDOS — o denominador certo é o header
 * X-Snapshot-Bytes (tamanho do JSON raw), nunca o Content-Length.
 */
export async function fetchDonationSnapshot(
  opts: {
    signal?: AbortSignal;
    onProgress?: (p: DonationLoadProgress) => void;
  } = {},
): Promise<DonationDataset> {
  const [response, customizationsResponse] = await Promise.all([
    http.get<SnapshotPayload>("/donation/snapshot", {
      signal: opts.signal,
      onDownloadProgress: (event) => {
        if (!opts.onProgress) return;
        const xhr = event.event?.target as XMLHttpRequest | undefined;
        const headerBytes = Number(xhr?.getResponseHeader?.("X-Snapshot-Bytes"));
        const totalBytes =
          Number.isFinite(headerBytes) && headerBytes > 0
            ? headerBytes
            : event.total ?? null;
        opts.onProgress({ loadedBytes: event.loaded, totalBytes });
      },
    }),
    http.get<CustomizationsPayload>("/donation/customizations", {
      signal: opts.signal,
    }),
  ]);

  const payload = response.data;
  const beneficiaries = new Map(payload.beneficiaries);
  return {
    total: payload.total,
    customizations: new Map(customizationsResponse.data),
    cities: payload.cities.map(([id, name, uf]) => ({ id, name, uf })),
    ongs: payload.ongs.map(([id, name, profile_image]) => ({ id, name, profile_image: profile_image ?? null })),
    donations: payload.data.map(([id, value, cityId, ongId]) => ({
      id,
      value,
      cityId,
      ongId,
      ongIds: beneficiaries.get(id) ?? [ongId],
    })),
  };
}

/** Pré-lançamento: personalização salva somente neste navegador. */
export async function saveDonationCustomization(
  userId: number,
  donationId: number,
  customization: BuildingCustomization,
): Promise<void> {
  saveLocalCustomization(userId, donationId, customization);
}
