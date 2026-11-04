import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "@/hooks/useAuth";
import { canUseCustomization } from "@/lib/unlock";
import { getNextReward } from "@/lib/rewardNotifications";
import { toast } from "@/components/ui/toast";
import {
  fetchCustomizationCatalog,
  fetchMyUnlocks,
  acknowledgeRewards,
  chooseSignupReward,
  type MyUnlocks,
  type CatalogOption,
  type CatalogFeature,
  type CustomizationCatalog,
} from "../../api/customizationApi";

// Falha vira catálogo vazio: `null` é só "carregando" — o loading da cena espera por ele.
const EMPTY_CATALOG: CustomizationCatalog = {
  shapes: [], rooftops: [], edgeLights: [], colors: [], textures: [],
  features: { sign: null, hologram: null },
};

/**
 * Carrega o catálogo de personalizações do backend uma vez no mount.
 * Enquanto `null`, o painel mostra estado de carregamento.
 */
export function useCustomizationCatalog(refreshKey = 0) {
  const { user, isAdmin } = useAuth();
  const userId = user?.id;
  const [catalog, setCatalog] = useState<CustomizationCatalog | null>(null);
  const [unlocks, setUnlocks] = useState<{ userId: number; data: MyUnlocks } | null>(null);
  const [dismissed, setDismissed] = useState<{ userId: number; keys: string[] } | null>(null);

  const requestVersion = useRef(0);
  const choosing = useRef(false);
  const [reload, setReload] = useState(0);
  const [deferred, setDeferred] = useState<{ userId: number; refreshKey: number } | null>(null);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!userId || isAdmin) return;
    const controller = new AbortController();
    fetchMyUnlocks({ signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted && version === requestVersion.current) setUnlocks({ userId, data });
    }).catch((err: unknown) => {
      if (!controller.signal.aborted && !axios.isCancel(err)) console.error("Falha ao carregar benefícios", err);
    });
    return () => controller.abort();
  }, [userId, isAdmin, refreshKey, reload]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomizationCatalog({ signal: controller.signal })
      .then(setCatalog)
      .catch((err: unknown) => {
        if (controller.signal.aborted || axios.isCancel(err)) return;
        console.error("Falha ao carregar catálogo de personalizações", err);
        setCatalog(EMPTY_CATALOG);
      });
    return () => controller.abort();
  }, []);

  const resolvedCatalog = useMemo(() => {
    if (!catalog) return null;
    // Nunca reaproveita benefícios de outra sessão durante login/logout.
    const mine = userId && unlocks?.userId === userId ? unlocks.data : null;
    const options = (items: CatalogOption[]) => items.map((item) => ({
      ...item, isUnlocked: canUseCustomization(item.unlock, mine?.progress ?? null, !!mine?.unlockedOptionIds.includes(item.id), isAdmin),
    }));
    const feature = (key: string, item: CatalogFeature | null): CatalogFeature | null => item && ({
      ...item, isUnlocked: canUseCustomization(item.unlock, mine?.progress ?? null, !!mine?.unlockedCategoryKeys.includes(key), isAdmin),
    });
    return {
      shapes: options(catalog.shapes), colors: options(catalog.colors), textures: options(catalog.textures),
      rooftops: options(catalog.rooftops), edgeLights: options(catalog.edgeLights),
      features: { sign: feature("sign", catalog.features.sign), hologram: feature("hologram", catalog.features.hologram) },
    };
  }, [catalog, unlocks, userId, isAdmin]);

  const mine = !isAdmin && userId && unlocks?.userId === userId ? unlocks.data : null;
  const pending = useMemo(() => {
    const dismissedKeys = new Set(dismissed && dismissed.userId === userId ? dismissed.keys : []);
    return (mine?.pendingRewards ?? []).filter((reward) => !dismissedKeys.has(reward.key));
  }, [dismissed, mine, userId]);
  const next = useMemo(() => resolvedCatalog && mine
    ? getNextReward(resolvedCatalog, mine.progress) : null, [resolvedCatalog, mine]);

  function dismissRewards(keys: string[]) {
    if (!userId || !keys.length) return;
    setDismissed((previous) => ({
      userId, keys: [...(previous?.userId === userId ? previous.keys : []), ...keys],
    }));
    // Fecha mesmo offline; sem confirmação no servidor, reaparece na próxima visita.
    void acknowledgeRewards(keys).catch(() => {
      toast.error("Não foi possível salvar o aviso como visto.", {
        description: "Suas recompensas estão garantidas. O aviso poderá reaparecer.",
      });
    });
  }

  const campaign = mine?.signupRewards;
  const availableChoice = campaign?.tiers.find((tier) => tier.referralMin <= campaign.referrals);
  const choice = deferred?.userId === userId && deferred?.refreshKey === refreshKey ? null : availableChoice;
  const nextChoice = campaign?.tiers.find((tier) => tier.referralMin > campaign.referrals);

  async function choose(referralMin: number, key: string) {
    if (!userId || choosing.current) return;
    choosing.current = true;
    const version = ++requestVersion.current;
    try {
      const data = await chooseSignupReward(referralMin, key);
      if (version === requestVersion.current) setUnlocks({ userId, data });
    } catch (error) {
      if (version === requestVersion.current) setReload((value) => value + 1);
      throw error;
    } finally { choosing.current = false; }
  }

  return {
    catalog: resolvedCatalog,
    rewards: {
      pending,
      next,
      choice,
      nextChoice,
      signupReferrals: campaign?.referrals ?? 0,
      choose,
      deferChoice: () => { if (userId) setDeferred({ userId, refreshKey }); },
      dismiss: dismissRewards,
    },
  };
}

export type RewardNotifications = ReturnType<typeof useCustomizationCatalog>["rewards"];
