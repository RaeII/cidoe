import type { Contribution, BuildingProfile } from "../api/contributionApi";
import type { City, DonationRecord } from "../api/donationApi";
import type { BuildingCustomization, BuildingShape, RooftopType } from "../scene/types";
import { readProjectStorage } from "./projectStorage";

export type LocalBuilding = DonationRecord & { city: City };
export const LOCAL_CITY_EVENT = "cidoe:prelaunch-city";

export function localCityKey(userId: number | null, area: string): string {
  return `cidoe:prelaunch:v1:${userId ?? "guest"}:${area}`;
}

export function readLocalValue<T>(userId: number | null, area: string, fallback: T): T {
  const raw = readProjectStorage(window.localStorage, localCityKey(userId, area));
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (fallback !== null && (parsed === null || typeof parsed !== typeof fallback || Array.isArray(parsed) !== Array.isArray(fallback))) {
      throw new Error();
    }
    if (area === "buildings" && !isValidLocalBuildings(parsed)) throw new Error();
    return parsed as T;
  } catch {
    throw new Error("Dados locais inválidos. Não foi possível carregar sua cidade.");
  }
}

export function writeLocalValue<T>(userId: number | null, area: string, value: T): void {
  const key = localCityKey(userId, area);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error("Não foi possível salvar neste navegador. Verifique o espaço e a permissão de armazenamento.");
  }
  window.dispatchEvent(new CustomEvent(LOCAL_CITY_EVENT, { detail: key }));
}

function isValidLocalBuildings(value: unknown): value is LocalBuilding[] {
  return Array.isArray(value) && value.every((building: LocalBuilding) => building && Number.isSafeInteger(building.id) && building.id < 0
    && Number.isFinite(building.value) && building.value > 0 && Number.isSafeInteger(building.cityId)
    && Number.isSafeInteger(building.ongId) && Array.isArray(building.ongIds)
    && building.ongIds.every(Number.isSafeInteger) && building.city?.id === building.cityId
    && typeof building.city.name === "string" && typeof building.city.uf === "string");
}

const SEED_CITIES: City[] = [
  { id: 3550308, name: "São Paulo", uf: "SP" },
  { id: 3304557, name: "Rio de Janeiro", uf: "RJ" },
  { id: 3106200, name: "Belo Horizonte", uf: "MG" },
  { id: 2927408, name: "Salvador", uf: "BA" },
  { id: 2611606, name: "Recife", uf: "PE" },
  { id: 4106902, name: "Curitiba", uf: "PR" },
  { id: 4314902, name: "Porto Alegre", uf: "RS" },
  { id: 5300108, name: "Brasília", uf: "DF" },
];
// Enche a grade 3×3 de quadras que a cena sempre desenha (central 7×7 + 8 de 8×8).
const SEED_COUNT = 480;

/** Cidade inicial do pré-lançamento: edifícios fixos só no front. IDs bem abaixo dos locais (-1…-3). */
export function createSeedBuildings(ongs: readonly { id: number }[]): LocalBuilding[] {
  return Array.from({ length: SEED_COUNT }, (_, index) => {
    // Cauda longa: poucas torres altas, muita base baixa. Índice = ordem de valor.
    const value = Math.round(5 + 595 * (1 - index / SEED_COUNT) ** 3);
    const city = SEED_CITIES[index % SEED_CITIES.length];
    const ongId = ongs.length ? ongs[index % ongs.length].id : 0;
    return { id: -1_000_000 - index, value, cityId: city.id, city, ongId, ongIds: ongs.length ? [ongId] : [] };
  });
}

// Skyline: as 40 maiores giram pelos 15 formatos. Índice 0 = central e mais alto → Residencial (sacadas).
const SEED_SHAPES: BuildingShape[] = ["residential", "setback", "chrysler", "default", "octagonal", "taipei",
  "apartment", "gourmet", "loft", "hearst", "twisted", "empire", "yachthouse", "tapered", "one-trade"];
// Base: 1 a cada 4 foge da caixa; repetição prioriza os novos residenciais, demais seguem instanciados.
const SEED_BASE_SHAPES: BuildingShape[] = ["apartment", "gourmet", "loft", "residential",
  "apartment", "gourmet", "loft", "setback", "apartment", "gourmet", "loft", "octagonal"];
// Pool fixo da cidade inicial: sorteio igual em local e produção, independente do catálogo.
// Fachadas leves; Facade007, Facade014, Facade016 e Facade019A ficam fora da cidade inicial.
export const SEED_FACADE_TEXTURES = ["Facade001_1K-PNG", "Facade005_1K-JPG", "Facade018A_1K-PNG",
  "Facade020A_1K-JPG", "Facade006_1K-mirrored-PNG", "Facade002_1K-PNG"];
// Topo estreito/pináculo: acessório de topo ficaria flutuando.
const SEED_SPIRE_SHAPES = new Set<BuildingShape>(["tapered", "chrysler", "empire", "taipei", "one-trade"]);
const SEED_TOWER_ROOFTOPS: RooftopType[] = ["helipad", "none", "helicopter", "none", "spotlights"];
// Só tons escuros e dessaturados (grafite, ardósia, café, bronze, musgo): nada claro nem vivo.
const SEED_COLORS = ["#3a3d42", "#2f3338", "#4a4540", "#3d3530", "#33393f", "#454a4f", "#3b3f3a", "#4d443b", "#2b2e33", "#40403c"];

// = DEFAULT_BUILDING_SETTINGS.color; import de valor quebraria o check sem bundler.
const SEED_DEFAULT_COLOR = "#d4d4d4";

/**
 * Edifícios iniciais variados, acessório e cor raros. Seed sem nada especial fica fora
 * do mapa → segue a cor global da cena. Textura `null` → sorteio por edifício.
 */
export function createSeedCustomizations(seeds: readonly LocalBuilding[]): Map<number, BuildingCustomization> {
  return new Map(seeds.flatMap((seed, index) => {
    const buildingShape = index < 40 ? SEED_SHAPES[index % SEED_SHAPES.length]
      : index % 4 === 0 ? SEED_BASE_SHAPES[(index / 4) % SEED_BASE_SHAPES.length] : "default";
    const rooftopType = SEED_SPIRE_SHAPES.has(buildingShape) ? "none"
      : index < 40 ? SEED_TOWER_ROOFTOPS[index % SEED_TOWER_ROOFTOPS.length] : index % 13 === 0 ? "garden" : "none";
    const signText = index === 0 ? "Cidoe" : index % 40 === 2 ? seed.city.name : "";
    // LED só em torre alta (top 40); prédio baixo nunca brilha.
    const edgeLightType = index < 40 && index % 9 === 4 ? "led" : "none";
    // Cor em 1 a cada 24 (~20 edifícios).
    const color = index % 24 === 7 ? SEED_COLORS[(index / 24 | 0) % SEED_COLORS.length] : SEED_DEFAULT_COLOR;
    if (buildingShape === "default" && rooftopType === "none" && !signText && edgeLightType === "none"
      && color === SEED_DEFAULT_COLOR) return [];
    return [[seed.id, {
      color,
      buildingShape,
      rooftopType,
      signText,
      signSides: index === 0 ? 4 : 1,
      edgeLightType,
      textureKey: null,
      tilingScale: 1,
      textureTransform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      hologramImage: null,
      hologramColor: "#73f2ff",
      hologramOpacity: 0.78,
    }] as const];
  }));
}

export function readLocalBuildings(userId: number): LocalBuilding[] {
  return readLocalValue<LocalBuilding[]>(userId, "buildings", []);
}

/** Pré-lançamento: nenhum pagamento ou edifício é enviado ao backend. */
export function simulateContribution(userId: number, contribution: Contribution, city?: City | null): number {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Entre na sua conta para simular.");
  const cents = Math.round(contribution.value * 100);
  if (!Number.isSafeInteger(cents) || cents < 500 || !Number.isSafeInteger(contribution.ongId) || contribution.ongId <= 0) {
    throw new Error("Escolha uma ONG e um valor a partir de R$ 5.");
  }
  const buildings = readLocalBuildings(userId);
  let donationId: number;
  if (contribution.donationId === null) {
    if (buildings.length >= 3) throw new Error("Limite de 3 edifícios por conta neste navegador.");
    if (!city || city.id !== contribution.cityId || !Number.isSafeInteger(city.id) || city.id <= 0) {
      throw new Error("Escolha uma cidade.");
    }
    // IDs negativos não colidem com os registros públicos do banco.
    donationId = Math.min(0, ...buildings.map((building) => building.id)) - 1;
    buildings.push({ id: donationId, value: cents / 100, cityId: city.id, city,
      ongId: contribution.ongId, ongIds: [contribution.ongId] });
  } else {
    const building = buildings.find((item) => item.id === contribution.donationId);
    if (!building) throw new Error("Este edifício não pertence à sua simulação.");
    const total = Math.round(building.value * 100) + cents;
    if (!Number.isSafeInteger(total)) throw new Error("Valor acima do limite da simulação.");
    building.value = total / 100;
    building.ongIds = [...new Set([...building.ongIds, contribution.ongId])];
    donationId = building.id;
  }
  writeLocalValue(userId, "buildings", buildings);
  return donationId;
}

// Beta: aparência e perfil de qualquer edifício valem pro navegador, com ou sem conta (chave `guest`).
export function saveLocalCustomization(donationId: number, customization: BuildingCustomization): void {
  const saved = readLocalValue<Record<string, BuildingCustomization>>(null, "customizations", {});
  writeLocalValue(null, "customizations", { ...saved, [donationId]: customization });
}

export function saveLocalProfile(donationId: number, profile: BuildingProfile): void {
  const saved = readLocalValue<Record<string, BuildingProfile>>(null, "profiles", {});
  writeLocalValue(null, "profiles", { ...saved, [donationId]: profile });
}

// Estados nomeados = foto de todas as chaves da cidade local (edifícios, aparência, perfis, ajustes da cena).
// Chave fora do prefixo da cidade: a foto não inclui a si mesma.
const CITY_PREFIX = "cidoe:prelaunch:v1:";
const CITY_STATES_KEY = "cidoe:prelaunch:states:v1";

export type CityState = { name: string; savedAt: number; data: Record<string, string> };

function cityKeys(): string[] {
  const storage = window.localStorage;
  return Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? "")
    .filter((key) => key.startsWith(CITY_PREFIX));
}

/** Lança em JSON inválido: quem chama não sobrescreve estados que não conseguiu ler. */
export function readCityStates(): CityState[] {
  const raw = window.localStorage.getItem(CITY_STATES_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed as CityState[];
  } catch {
    throw new Error("Estados salvos inválidos neste navegador.");
  }
}

function writeCityStates(states: CityState[]): CityState[] {
  try {
    window.localStorage.setItem(CITY_STATES_KEY, JSON.stringify(states));
  } catch {
    throw new Error("Sem espaço neste navegador para salvar o estado.");
  }
  return states;
}

/** Mesmo nome sobrescreve, mantendo a posição na lista. */
export function saveCityState(name: string): CityState[] {
  const data = Object.fromEntries(cityKeys().map((key) => [key, window.localStorage.getItem(key) ?? ""]));
  const states = readCityStates();
  const state = { name, savedAt: Date.now(), data };
  const index = states.findIndex((item) => item.name === name);
  if (index < 0) states.push(state);
  else states[index] = state;
  return writeCityStates(states);
}

export function deleteCityState(name: string): CityState[] {
  return writeCityStates(readCityStates().filter((state) => state.name !== name));
}

/** Substitui a cidade atual pela foto; hooks locais recebem o evento e a cena troca sem recarregar. */
export function loadCityState(state: CityState): void {
  const current = cityKeys();
  // Remove antes de gravar: libera espaço pra foto.
  for (const key of current) if (!(key in state.data)) window.localStorage.removeItem(key);
  try {
    for (const [key, value] of Object.entries(state.data)) window.localStorage.setItem(key, value);
  } catch {
    throw new Error("Sem espaço neste navegador para carregar o estado.");
  } finally {
    for (const key of new Set([...current, ...Object.keys(state.data)])) {
      window.dispatchEvent(new CustomEvent(LOCAL_CITY_EVENT, { detail: key }));
    }
  }
}
