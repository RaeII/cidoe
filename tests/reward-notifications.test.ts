import { describe, expect, test } from "bun:test";
import type { CatalogOption, CustomizationCatalog } from "../src/api/customizationApi";
import { formatRewardReason, getNextReward } from "../src/lib/rewardNotifications";

const empty: CustomizationCatalog = {
  shapes: [], rooftops: [], edgeLights: [], colors: [], textures: [],
  features: { sign: null, hologram: null },
};
const option = (id: number, unlock: CatalogOption["unlock"], isUnlocked = false): CatalogOption => ({
  id, key: `shape-${id}`, label: `Formato ${id}`, value: null, sortOrder: id, unlock, isUnlocked,
});
const text = (value: string) => value.replace(/\s/g, " ");

describe("motivo da conquista", () => {
  test("usa requisito histórico, eixos configurados e combinação original", () => {
    expect(text(formatRewardReason({ donationMin: 49.9, referralMin: null })))
      .toBe("Você atingiu R$ 49,90 em doações acumuladas.");
    expect(formatRewardReason({ donationMin: null, referralMin: 1 }))
      .toBe("Você atingiu 1 indicação.");
    expect(text(formatRewardReason({ donationMin: 50, referralMin: 2, mode: "all" })))
      .toBe("Você atingiu R$ 50 em doações acumuladas e 2 indicações.");
    expect(text(formatRewardReason({ donationMin: 50, referralMin: 2, mode: "any" })))
      .toBe("Você atingiu R$ 50 em doações acumuladas ou 2 indicações.");
    expect(formatRewardReason(null)).toBe("Presente por estar entre os primeiros inscritos.");
  });
});

describe("próxima conquista", () => {
  test("segue o passe e ignora grátis e conquistas permanentes com requisito aumentado", () => {
    const catalog = { ...empty, shapes: [
      option(1, null), option(2, { donationMin: 500, referralMin: null }, true),
      option(3, { donationMin: 100, referralMin: null }),
      option(4, { donationMin: 30, referralMin: null }),
    ] };
    const before = structuredClone(catalog);
    const next = getNextReward(catalog, { donated: 20, referrals: 0 });
    expect(next?.reward.key).toBe("option:4");
    expect(next?.reward.optionKey).toBe("shape-4");
    expect(text(next!.remaining)).toBe("Faltam R$ 10");
    expect(catalog).toEqual(before);
  });

  test("AND pede só o restante; OR cumprido não é sugerido", () => {
    const all = { donationMin: 50, referralMin: 3, mode: "all" as const };
    const catalog = { ...empty, shapes: [option(1, { ...all, mode: "any" }), option(2, all)] };
    const next = getNextReward(catalog, { donated: 60, referrals: 1 });
    expect(next?.reward.key).toBe("option:2");
    expect(next?.remaining).toBe("Faltam 2 indicações");
    expect(getNextReward(catalog, { donated: 60, referrals: 3 })).toBeNull();
  });

  test("OR mostra alternativas restantes e inclui categorias feature", () => {
    const catalog = { ...empty, features: {
      sign: { unlock: { donationMin: 50, referralMin: 2, mode: "any" as const }, isUnlocked: false },
      hologram: null,
    } };
    const next = getNextReward(catalog, { donated: 49.9, referrals: 1 });
    expect(next?.reward.categoryKey).toBe("sign");
    expect(text(next!.remaining)).toBe("Faltam R$ 0,10 ou 1 indicação");
    expect(getNextReward({ ...catalog, features: { ...catalog.features, sign: { ...catalog.features.sign, isUnlocked: true } } }, { donated: 0, referrals: 0 })).toBeNull();
  });

  test("catálogo vazio ou concluído não inventa outra meta", () => {
    expect(getNextReward(empty, { donated: 0, referrals: 0 })).toBeNull();
    expect(getNextReward({ ...empty, colors: [option(1, { donationMin: 10, referralMin: null }, true)] }, { donated: 100, referrals: 20 })).toBeNull();
  });
});
