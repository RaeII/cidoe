import { http } from "./http";
import { saveLocalCustomization } from "../lib/prelaunchCity";
import { IS_PRELAUNCH } from "../lib/legal";
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
type SnapshotOptions = {
  signal?: AbortSignal;
  onProgress?: (p: DonationLoadProgress) => void;
};

/**
 * Busca o snapshot cacheado e, em paralelo, as personalizações atuais sem cache.
 * Pré-lançamento: cidade e aparência são locais; personalizações do banco nem descem.
 *
 * Progresso: com Content-Encoding gzip o browser zera ProgressEvent.total e
 * `loaded` conta bytes DESCOMPRIMIDOS — o denominador certo é o header
 * X-Snapshot-Bytes (tamanho do JSON raw), nunca o Content-Length.
 */
export async function fetchDonationSnapshot(opts: SnapshotOptions = {}): Promise<DonationDataset> {
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
    IS_PRELAUNCH
      ? { data: [] as CustomizationsPayload }
      : http.get<CustomizationsPayload>("/donation/customizations", { signal: opts.signal }),
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

type Prefetch = {
  promise: Promise<DonationDataset>;
  last: DonationLoadProgress | null;
  listener: ((p: DonationLoadProgress) => void) | null;
};
let prefetched: Prefetch | null = null;

/**
 * Home: dispara no entry, em paralelo ao download do chunk da cena (antes só saía
 * quando o editor montava). Sem abort: quem consome descarta o resultado se desmontou.
 */
export function prefetchDonationSnapshot(): void {
  if (prefetched) return;
  const entry = { last: null, listener: null } as Omit<Prefetch, "promise"> as Prefetch;
  entry.promise = fetchDonationSnapshot({
    onProgress: (p) => {
      entry.last = p;
      entry.listener?.(p);
    },
  });
  // Erro chega a quem consome; aqui só evita "unhandled rejection" se ninguém consumir.
  entry.promise.catch(() => {});
  prefetched = entry;
}

/**
 * 1ª carga da cena: usa a busca antecipada (inclusive o progresso já recebido).
 * Depois de usada, some — remontar a cena mais tarde busca de novo.
 */
export function loadDonationSnapshot(opts: SnapshotOptions = {}): Promise<DonationDataset> {
  const entry = prefetched;
  if (!entry) return fetchDonationSnapshot(opts);
  entry.listener = opts.onProgress ?? null;
  if (entry.last) opts.onProgress?.(entry.last);
  // StrictMode remonta antes de resolver e reaproveita; resolvida, a próxima carga é nova.
  void entry.promise.finally(() => { if (prefetched === entry) prefetched = null; }).catch(() => {});
  return entry.promise;
}

/** Pré-lançamento: personalização salva somente neste navegador, com ou sem conta. */
export async function saveDonationCustomization(
  donationId: number,
  customization: BuildingCustomization,
): Promise<void> {
  saveLocalCustomization(donationId, customization);
}
