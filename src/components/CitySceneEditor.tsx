import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { CitySceneCanvas, type CitySceneCanvasHandle } from "./three/CitySceneCanvas";
import { AuthMenu } from "./AuthMenu";
import { ReferralHud } from "./referral/ReferralHud";
import { BuildingManageDialog } from "./html/BuildingManageDialog";
import { BuildingInfoModal } from "./html/BuildingInfoModal";
import { MyBuildingsNavigation } from "./html/MyBuildingsNavigation";
import { BuildingLayoutCard } from "./html/BuildingLayoutCard";
import { CityControlPanel } from "./html/CityControlPanel";
import { KeyboardShortcutsHelp } from "./html/KeyboardShortcutsHelp";
import {
  useKeyboardShortcuts,
  type KeyboardShortcut,
} from "./hooks/useKeyboardShortcuts";
import { useDonations } from "./hooks/useDonations";
import { useLocalSceneState } from "./hooks/useLocalCity";
import { useOwnedDonationIds } from "./hooks/useOwnedDonationIds";
import { useAuth } from "@/hooks/useAuth";
import { saveDonationCustomization } from "../api/donationApi";
import { useCustomizationCatalog } from "./hooks/useCustomizationCatalog";
import { DonationLoadOverlay } from "./html/DonationLoadOverlay";
import { DonationInfoSection } from "./html/DonationInfoSection";
import { ContributeDialog } from "./html/donate/ContributeDialog";
import { BuildingProfileDialog } from "./html/donate/BuildingProfileForm";
import {
  fetchBuildingProfile,
  type BuildingProfile,
} from "../api/contributionApi";
import { toast } from "./ui/toast";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { PixelArrow, PixelChevronDown } from "./ui/pixel-icon";
import { DEFAULT_SCENE_STATS } from "../scene/config/citySceneConfig";
import { createDefaultBlockLayoutSettings } from "../scene/config/blockLayoutConfig";
import { createDefaultBuildingSettings } from "../scene/config/buildingConfig";
import { createDefaultEnvironmentSettings } from "../scene/config/environmentConfig";
import { createDefaultGroundSettings } from "../scene/config/groundConfig";
import { createDefaultTerrainSettings } from "../scene/config/terrainConfig";
import { createDefaultLightSettings } from "../scene/config/lightConfig";
import { createDefaultReflectionSettings } from "../scene/config/reflectionConfig";
import { createDefaultTextureSettings } from "../scene/config/textureConfig";
import { createDefaultHorizonSettings } from "../scene/config/horizonConfig";
import { createDefaultUIVisibilitySettings } from "../scene/config/uiVisibilityConfig";
import type {
  BuildingCustomization,
  CameraDebugInfo,
  SceneStats,
} from "../scene/types";
import {
  DEFAULT_BUILDING_TEXTURE_TRANSFORM,
  DEFAULT_HOLOGRAM_COLOR,
  DEFAULT_HOLOGRAM_OPACITY,
} from "../scene/types";
import { getLightMetrics } from "../scene/utils/lighting";
import { SEED_FACADE_TEXTURES } from "@/lib/prelaunchCity";

const formatCameraValue = (value: number) => value.toFixed(2);

// Arrasto de slider salva apenas o estado final no navegador.
const SAVE_DEBOUNCE_MS = 500;
const createDefaultGrain = () => 0;
const createDefaultVisibleLimit = (): number | null => null;

export function CitySceneEditor() {
  const canvasRef = useRef<CitySceneCanvasHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inInfo, setInInfo] = useState(false);

  const [buildingSettings, setBuildingSettings] = useLocalSceneState("building", createDefaultBuildingSettings);
  const [textureSettings, setTextureSettings] = useLocalSceneState("texture", createDefaultTextureSettings);
  const [groundSettings, setGroundSettings] = useLocalSceneState("ground", createDefaultGroundSettings);
  const [terrainSettings, setTerrainSettings] = useLocalSceneState("terrain", createDefaultTerrainSettings);
  const [lightSettings, setLightSettings] = useLocalSceneState("light", createDefaultLightSettings);
  const [environmentSettings, setEnvironmentSettings] = useLocalSceneState("environment", createDefaultEnvironmentSettings);
  const [reflectionSettings, setReflectionSettings] = useLocalSceneState("reflection", createDefaultReflectionSettings);
  const [horizonSettings, setHorizonSettings] = useLocalSceneState("horizon", createDefaultHorizonSettings);
  const [blockLayoutSettings, setBlockLayoutSettings] = useLocalSceneState("blockLayout", createDefaultBlockLayoutSettings);
  const [sceneStats, setSceneStats] = useState<SceneStats>({ ...DEFAULT_SCENE_STATS });
  // sceneReady síncrono: o runtime avisa "baixando" dentro do effect do canvas (pool novo do
  // catálogo), antes do effect que libera o loading — o state ainda estaria com o valor velho.
  const sceneReadyRef = useRef(false);
  const [cameraDebugInfo, setCameraDebugInfo] = useState<CameraDebugInfo | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ value: number; x: number; y: number } | null>(null);
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [uiVisibility, setUIVisibility] = useLocalSceneState("visibility", createDefaultUIVisibilitySettings);
  // Granulado zerado por padrão; preferência restaura por conta.
  const [grain, setGrain] = useLocalSceneState("grain", createDefaultGrain);
  // Clique abre informações; administração aberta a todos no beta.
  const [infoBuildingId, setInfoBuildingId] = useState<number | null>(null);
  const [showBuildingInfo, setShowBuildingInfo] = useState(true);
  const [myBuildingsOpen, setMyBuildingsOpen] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [manageTab, setManageTab] = useState<"information" | "appearance">("information");
  const [buildingCustomizations, setBuildingCustomizations] = useState<Map<number, BuildingCustomization>>(
    () => new Map(),
  );
  // Espelho do mapa p/ o rAF que reaplica na cena sem virar dependência do
  // effect de setDonations (senão cada troca de cor reconstruiria a cidade).
  const customizationsRef = useRef(buildingCustomizations);
  // donationId → debounce pendente. Guarda o payload junto p/ o flush do unmount.
  const pendingSaves = useRef(
    new Map<number, { timer: ReturnType<typeof setTimeout>; customization: BuildingCustomization }>(),
  );

  // Doações vêm do snapshot cacheado; personalizações, da leitura no-store.
  // Filtro client-side por região/UF/cidade/ONG; replace-all na cena a cada mudança.
  const {
    loadState,
    donations,
    allDonations,
    cities,
    ongs,
    savedCustomizations,
    seeded,
    filter,
    setFilter,
    retry,
  } = useDonations();
  const [customizationRevision, setCustomizationRevision] = useState(0);
  const { catalog: customizationCatalog, editorCatalog, rewards } = useCustomizationCatalog(customizationRevision);
  const { user, isAdmin } = useAuth();
  const handleStatsChange = useCallback((stats: SceneStats) => {
    sceneReadyRef.current = stats.sceneReady;
    // A interface pública só lê sceneReady; métricas por frame são do painel admin.
    setSceneStats((previous) => !isAdmin && previous.sceneReady === stats.sceneReady ? previous : stats);
  }, [isAdmin]);
  const { ids: ownedDonationIds } = useOwnedDonationIds();
  const [donationsApplied, setDonationsApplied] = useState(false);
  // Teto de edifícios na cena (null = todos). Corta as doações de menor valor.
  const [visibleLimit, setVisibleLimit] = useLocalSceneState("visibleLimit", createDefaultVisibleLimit);
  const [contributeOpen, setContributeOpen] = useState(false);
  // Login controlado aqui: o modal de contribuição também pede login.
  const [authOpen, setAuthOpen] = useState(false);
  const [profileEditId, setProfileEditId] = useState<number | null>(null);
  const [infoProfile, setInfoProfile] = useState<{ id: number; userId: number | undefined; profile: BuildingProfile | null } | null>(null);
  // Edifício a focar quando o rebuild da cena terminar (ex.: recém-erguido fora do filtro).
  const pendingFocusRef = useRef<number | null>(null);

  useEffect(() => {
    pendingFocusRef.current = null;
    // Troca de conta remove seleção e perfil da cidade anterior.
    canvasRef.current?.clearFocus();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInfoBuildingId(null);
    setSelectedBuildingId(null);
    setProfileEditId(null);
    setInfoProfile(null);
    setMyBuildingsOpen(false);
  }, [user?.id]);

  // Sobrepõe as edições ainda no debounce à personalização salva.
  useEffect(() => {
    const saved = new Map(savedCustomizations);
    for (const [id, entry] of pendingSaves.current) saved.set(id, entry.customization);
    customizationsRef.current = saved;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBuildingCustomizations(saved);
  }, [savedCustomizations]);

  useEffect(() => {
    customizationsRef.current = buildingCustomizations;
  }, [buildingCustomizations]);

  const visibleDonations = useMemo(() => {
    if (visibleLimit === null || visibleLimit >= donations.length) return donations;
    // O manager já ordena por valor desc; ordenar aqui garante que o corte
    // pegue as MAIORES doações, não as primeiras do dataset.
    return [...donations].sort((a, b) => b.value - a.value).slice(0, visibleLimit);
  }, [donations, visibleLimit]);

  const getBuildingSelection = useEffectEvent(() => ({ managedId: selectedBuildingId, infoId: infoBuildingId }));

  useEffect(() => {
    if (loadState.status !== "ready") return;
    const { managedId, infoId } = getBuildingSelection();
    const keepManagement = managedId !== null && visibleDonations.some((d) => d.id === managedId);
    const retainedInfoId = infoId !== null && visibleDonations.some((d) => d.id === infoId) ? infoId : null;
    // Replace-all reseta dimming/foco. Administração permanece se edifício continua visível.
    canvasRef.current?.clearFocus();
    // Sincroniza um sistema externo (cena Three.js) imperativo e reflete o
    // progresso no render (overlay) — set-state-in-effect é intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedBuildingId(keepManagement ? managedId : null);
    setInfoBuildingId(retainedInfoId);
    setDonationsApplied(false);
    // setDonations é síncrono (rebuild inline ~0,5s p/ 100k). Duplo rAF: rAF
    // dispara ANTES do paint do próprio frame — só o 2º garante o overlay
    // pintado antes do freeze; sem isso, trocar filtro trava a UI sem máscara.
    let rafInner = 0;
    const rafOuter = requestAnimationFrame(() => {
      rafInner = requestAnimationFrame(() => {
        canvasRef.current?.setDonations(visibleDonations);
        // setDonations é replace-all: o manager só preserva o que já estava na
        // cena, então o que veio do banco (e o que voltou pelo filtro) precisa
        // ser reaplicado aqui.
        // ponytail: updateDonationCustomization faz find O(n) por chamada — ok
        // enquanto prédio personalizado for minoria; indexar por id se crescer.
        for (const [id, customization] of customizationsRef.current) {
          canvasRef.current?.updateDonationCustomization(id, customization);
        }
        // Aqui e não num effect à parte: focusOnDonation é no-op até o edifício
        // existir na cena. Releitura mantém card/administração do edifício visível.
        const { managedId: activeManagedId, infoId: activeInfoId } = getBuildingSelection();
        const focusId = pendingFocusRef.current ?? activeManagedId ?? activeInfoId;
        if (focusId !== null && visibleDonations.some((d) => d.id === focusId)) {
          pendingFocusRef.current = null;
          canvasRef.current?.focusOnDonation(focusId);
          if (activeManagedId !== focusId) setInfoBuildingId(focusId);
        }
        setDonationsApplied(true);
      });
    });
    return () => {
      cancelAnimationFrame(rafOuter);
      cancelAnimationFrame(rafInner);
    };
  }, [visibleDonations, loadState.status]);

  // Página de loading sai uma vez só, com tudo pronto: doações aplicadas, catálogo (pool de
  // texturas) resolvido e cena sem nada baixando/compilando. Depois disso rebuilds usam o overlay.
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (booted || loadState.status !== "ready" || !donationsApplied || !customizationCatalog) return;
    if (sceneReadyRef.current) setBooted(true);
  }, [booted, loadState.status, donationsApplied, customizationCatalog, sceneStats.sceneReady]);

  // Pool de sorteio de textura por edifício: todas as texturas ATIVAS do
  // catálogo. Desligado o sorteio, a lista vai vazia e a cidade inteira usa
  // `textureSettings.textureKey`. Cidade inicial usa pool fixo, igual em local e produção.
  const facadeTexturePool = useMemo(() => {
    if (!textureSettings.randomPerBuilding) return [];
    if (seeded) return SEED_FACADE_TEXTURES;
    const catalog = (customizationCatalog?.textures ?? [])
      .map((option) => option.value)
      .filter((value): value is string => !!value);
    return catalog;
  }, [textureSettings.randomPerBuilding, customizationCatalog, seeded]);

  const lightMetrics = getLightMetrics(lightSettings);

  const handleHoverChange = useCallback(
    (value: number | null, x: number, y: number) => {
      setHoverInfo(value !== null ? { value, x, y } : null);
    },
    [],
  );

  // Botão de editar segue o edifício em foco sem re-render: runtime grava a posição no estilo.
  const editButtonRef = useRef<HTMLDivElement>(null);
  const handleFocusScreenPosition = useCallback((x: number, y: number) => {
    editButtonRef.current?.style.setProperty("--edit-x", `${x}px`);
    editButtonRef.current?.style.setProperty("--edit-y", `${y}px`);
  }, []);

  // Painel lateral de edição cobre a direita: a cena recentra o edifício na área livre.
  const handleViewShift = useCallback((px: number) => canvasRef.current?.setViewShift(px), []);

  const handleBuildingClick = useCallback(
    (donationId: number | null) => {
      // Edição aberta (painel lateral deixa a cena clicável): clique não troca de edifício.
      if (selectedBuildingId !== null) return;
      setMyBuildingsOpen(false);
      pendingFocusRef.current = null;
      if (donationId !== null) {
        canvasRef.current?.focusOnDonation(donationId);
      } else {
        canvasRef.current?.clearFocus();
      }
      setSelectedBuildingId(null);
      setInfoBuildingId(donationId);
      setShowBuildingInfo(true);
    },
    [selectedBuildingId],
  );

  const handleCloseInfo = useCallback(() => {
    pendingFocusRef.current = null;
    canvasRef.current?.clearFocus();
    setInfoBuildingId(null);
    setMyBuildingsOpen(false);
  }, []);

  // Informações → administração. Mantém o foco/zoom no edifício.
  const handleManageFromInfo = useCallback((tab: "information" | "appearance" = "information") => {
    setManageTab(tab);
    setSelectedBuildingId(infoBuildingId);
    setInfoBuildingId(null);
  }, [infoBuildingId]);

  const handleCloseManagement = useCallback(() => {
    setInfoBuildingId(selectedBuildingId);
    setSelectedBuildingId(null);
  }, [selectedBuildingId]);

  // Acesso pelo menu ou confirmação: revela o edifício mesmo fora do filtro/teto.
  const handleOpenDonation = (donationId: number, showInfo = true) => {
    setMyBuildingsOpen(!showInfo);
    scrollRef.current?.scrollTo({ top: 0 });
    setShowBuildingInfo(showInfo);
    setSelectedBuildingId(null);
    const visible = visibleDonations.some((d) => d.id === donationId);
    if (visible && donationsApplied) {
      pendingFocusRef.current = null;
      canvasRef.current?.focusOnDonation(donationId);
      setInfoBuildingId(donationId);
      return;
    }
    setInfoBuildingId(null);
    if (!visible) {
      setFilter({});
      setVisibleLimit(null);
    }
    // Releitura após pagamento pode chegar depois do clique.
    pendingFocusRef.current = donationId;
  };

  // Imagem/nome/descrição ficam fora do snapshot: busca no clique.
  useEffect(() => {
    if (infoBuildingId === null || !showBuildingInfo) return;
    const controller = new AbortController();
    fetchBuildingProfile(infoBuildingId, controller.signal, user?.id).then(
      (profile) => {
        if (!controller.signal.aborted) setInfoProfile({ id: infoBuildingId, userId: user?.id, profile });
      },
      () => {},
    );
    return () => controller.abort();
  }, [infoBuildingId, showBuildingInfo, user?.id]);

  // Tudo que o modal mostra já veio no snapshot público — sem request no clique.
  const infoBuilding = useMemo(() => {
    if (infoBuildingId === null) return null;
    const donation = donations.find((d) => d.id === infoBuildingId);
    if (!donation) return null;
    const city = cities.find((c) => c.id === donation.cityId);
    return {
      value: donation.value,
      ongName: ongs.filter((o) => donation.ongIds.includes(o.id)).map((o) => o.name).join(", "),
      place: city ? `${city.name} · ${city.uf}` : undefined,
    };
  }, [infoBuildingId, donations, cities, ongs]);

  // Meus edifícios: todos os registros próprios, incluindo os ocultos pelo filtro/teto.
  const myDonations = useMemo(() => {
    if (ownedDonationIds.size === 0) return [];
    return allDonations
      .filter((d) => ownedDonationIds.has(d.id))
      .sort((a, b) => b.value - a.value)
      .map((d) => {
        const city = cities.find((c) => c.id === d.cityId);
        return {
          id: d.id,
          value: d.value,
          ongName: ongs.filter((o) => d.ongIds.includes(o.id)).map((o) => o.name).join(", "),
          place: city ? `${city.name} · ${city.uf}` : undefined,
        };
      });
  }, [ownedDonationIds, allDonations, cities, ongs]);

  // Edifício de outra pessoa em foco: só visualização (sem Administrar, perfil nem Simular contribuição).
  const infoIsOwn = infoBuildingId !== null && ownedDonationIds.has(infoBuildingId);
  const focusedId = infoBuildingId ?? selectedBuildingId;
  const viewingOthers = focusedId !== null && !ownedDonationIds.has(focusedId);

  const myBuildingIndex = myDonations.findIndex((donation) => donation.id === infoBuildingId);
  const currentMyBuilding = myDonations[myBuildingIndex];

  const handleBrowseMyBuildings = () => {
    const donation = currentMyBuilding ?? myDonations[0];
    if (donation) {
      handleOpenDonation(donation.id, false);
    } else {
      toast.info("Você ainda não tem edifícios. Contribua para criar o primeiro.");
    }
  };

  const handleStepMyBuilding = (direction: number) => {
    if (myBuildingIndex < 0) return;
    const index = (myBuildingIndex + direction + myDonations.length) % myDonations.length;
    handleOpenDonation(myDonations[index].id, false);
  };

  const getExistingCustomization = useCallback(
    (donationId: number): BuildingCustomization => {
      const existing = buildingCustomizations.get(donationId);
      return {
        color: existing?.color ?? buildingSettings.color,
        buildingShape: existing?.buildingShape ?? "default" as const,
        textureKey: existing?.textureKey ?? null,
        tilingScale: existing?.tilingScale ?? 1,
        textureTransform: existing?.textureTransform ?? { ...DEFAULT_BUILDING_TEXTURE_TRANSFORM },
        rooftopType: existing?.rooftopType ?? "none" as const,
        signText: existing?.signText ?? "",
        signSides: existing?.signSides ?? 1,
        edgeLightType: existing?.edgeLightType ?? "none" as const,
        hologramImage: existing?.hologramImage ?? null,
        hologramColor: existing?.hologramColor ?? DEFAULT_HOLOGRAM_COLOR,
        hologramOpacity: existing?.hologramOpacity ?? DEFAULT_HOLOGRAM_OPACITY,
      };
    },
    [buildingCustomizations, buildingSettings.color],
  );

  const selectedCustomization = useMemo(
    () => selectedBuildingId === null ? null : getExistingCustomization(selectedBuildingId),
    [selectedBuildingId, getExistingCustomization],
  );

  const flushSave = useCallback((donationId: number, customization: BuildingCustomization) => {
    pendingSaves.current.delete(donationId);
    // Um toast por edifício: falhas seguidas (arrasto de slider) substituem
    // em vez de empilhar; o próximo save ok fecha.
    const toastId = `save-customization-${donationId}`;
    function save(data: BuildingCustomization) {
      saveDonationCustomization(donationId, data)
        .then(() => toast.dismiss(toastId))
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Não foi possível salvar neste navegador.", {
            id: toastId,
            action: {
              label: "Tentar de novo",
              onClick: () => save(data),
            },
          });
        });
    }
    save(customization);
  }, []);

  // Um debounce por edifício: editar A e depois B não pode cancelar o save de A. Beta: salva sem conta.
  const queueSave = useCallback(
    (donationId: number, customization: BuildingCustomization) => {
      clearTimeout(pendingSaves.current.get(donationId)?.timer);
      pendingSaves.current.set(donationId, {
        customization,
        timer: setTimeout(() => flushSave(donationId, customization), SAVE_DEBOUNCE_MS),
      });
    },
    [flushSave],
  );

  // Recarregar/fechar a aba também preserva a última edição do slider.
  useEffect(() => {
    const pending = pendingSaves.current;
    const flushPending = () => {
      for (const [donationId, entry] of pending) {
        clearTimeout(entry.timer);
        flushSave(donationId, entry.customization);
      }
    };
    window.addEventListener("pagehide", flushPending);
    return () => {
      window.removeEventListener("pagehide", flushPending);
      flushPending();
    };
  }, [flushSave]);

  const updateCustomization = useCallback(
    (donationId: number, patch: Partial<BuildingCustomization>) => {
      setBuildingCustomizations((prev) => {
        const next = new Map(prev);
        const existing = next.get(donationId);
        const updated: BuildingCustomization = {
          color: existing?.color ?? buildingSettings.color,
          buildingShape: existing?.buildingShape ?? "default",
          textureKey: existing?.textureKey ?? null,
          tilingScale: existing?.tilingScale ?? 1,
          textureTransform: existing?.textureTransform ?? { ...DEFAULT_BUILDING_TEXTURE_TRANSFORM },
          rooftopType: existing?.rooftopType ?? "none",
          signText: existing?.signText ?? "",
          signSides: existing?.signSides ?? 1,
          edgeLightType: existing?.edgeLightType ?? "none",
          hologramImage: existing?.hologramImage ?? null,
          hologramColor: existing?.hologramColor ?? DEFAULT_HOLOGRAM_COLOR,
          hologramOpacity: existing?.hologramOpacity ?? DEFAULT_HOLOGRAM_OPACITY,
          ...patch,
        };
        next.set(donationId, updated);
        canvasRef.current?.updateDonationCustomization(donationId, updated);
        queueSave(donationId, updated);
        return next;
      });
    },
    [buildingSettings.color, queueSave],
  );

  // Painel é ferramenta de admin.
  const shortcuts: KeyboardShortcut[] = [
    ...(isAdmin && !myBuildingsOpen ? [{
      key: "m",
      ctrl: true,
      description: "Abrir/fechar painel de controle",
      handler: () => setShowControlPanel((open) => !open),
    }] : []),
    {
      key: "?",
      shift: true,
      description: "Mostrar/esconder esta ajuda",
      handler: () => { if (!myBuildingsOpen) setShowShortcutsHelp((open) => !open); },
    },
    {
      key: "Escape",
      allowInInput: true,
      description: "Fechar painel aberto",
      handler: () => {
        if (showShortcutsHelp) {
          setShowShortcutsHelp(false);
        } else if (infoBuildingId !== null || (myBuildingsOpen && selectedBuildingId === null)) {
          if (myBuildingsOpen && currentMyBuilding && showBuildingInfo) setShowBuildingInfo(false);
          else handleCloseInfo();
        } else if (selectedBuildingId === null) {
          setShowControlPanel(false);
        }
      },
    },
  ];

  useKeyboardShortcuts(shortcuts);

  const scrollToInfo = useCallback(() => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.clientHeight, behavior: "smooth" });
  }, []);

  const scrollToScene = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      // Painel rolável mantém o gesto; navegação não bloqueia seu conteúdo.
      let node = event.target instanceof HTMLElement ? event.target : null;
      while (node && node !== el) {
        const overflowY = getComputedStyle(node).overflowY;
        if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
          return;
        }
        node = node.parentElement;
      }

      const viewport = el.clientHeight;
      const atScene = el.scrollTop < viewport / 2;
      if (atScene) {
        if (event.deltaY > 0) event.preventDefault();
        return;
      }
      if (event.deltaY < 0 && el.scrollTop <= viewport) {
        event.preventDefault();
        el.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    const onScroll = () => {
      setInInfo(el.scrollTop > el.clientHeight / 2);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div ref={scrollRef} className={cn("h-svh w-full overflow-x-hidden bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", myBuildingsOpen ? "overflow-y-hidden" : "overflow-y-auto")}>
    {/* svh: no mobile, h-screen (100vh) passa por baixo da barra do navegador e esconde os botões do rodapé. */}
    <div id="city-scene" className="relative h-svh w-full overflow-hidden bg-background">
      <CitySceneCanvas
        ref={canvasRef}
        buildingSettings={buildingSettings}
        textureSettings={textureSettings}
        groundSettings={groundSettings}
        terrainSettings={terrainSettings}
        lightSettings={lightSettings}
        environmentSettings={environmentSettings}
        reflectionSettings={reflectionSettings}
        horizonSettings={horizonSettings}
        blockLayoutSettings={blockLayoutSettings}
        facadeTexturePool={facadeTexturePool}
        grain={grain}
        onStatsChange={handleStatsChange}
        onCameraDebugChange={isAdmin && uiVisibility.cameraLog ? setCameraDebugInfo : undefined}
        onHoverChange={myBuildingsOpen ? undefined : handleHoverChange}
        onBuildingClick={handleBuildingClick}
        onFocusScreenPosition={handleFocusScreenPosition}
      />
      {/* Página de loading (a mesma do index.html) cobre a cena até tudo carregar. */}
      <DonationLoadOverlay cover hidden={booted} state={loadState} onRetry={retry} />
      {/* Controles da cena só depois do loading; apresentação pública segue independente. */}
      {booted && (
      <div hidden={myBuildingsOpen || selectedBuildingId !== null} className="pointer-events-none absolute inset-x-4 top-4 z-30 flex items-start justify-between gap-2 max-sm:flex-wrap-reverse">
        {/* Marca visível sem rolar nem entrar (página inicial do login com Google). Sem espaço ao lado dos botões, desce para a linha de baixo (wrap-reverse). */}
        <ReferralHud rewards={rewards} onLogin={() => setAuthOpen(true)} />
        <div className="pointer-events-auto ml-auto shrink-0">
          <AuthMenu
            night={environmentSettings.night}
            onNightChange={(night) => setEnvironmentSettings((prev) => ({ ...prev, night }))}
            myDonations={myDonations}
            catalog={customizationCatalog}
            rewards={rewards}
            onRefreshRewards={() => setCustomizationRevision((revision) => revision + 1)}
            onOpenDonation={handleOpenDonation}
            onBrowseMyBuildings={handleBrowseMyBuildings}
            authOpen={authOpen}
            onAuthOpenChange={setAuthOpen}
            onboardingBlocked={myBuildingsOpen || contributeOpen || showShortcutsHelp || infoBuildingId !== null || selectedBuildingId !== null || profileEditId !== null}
          />
        </div>
      </div>
      )}
      {booted && (
        <div hidden={myBuildingsOpen}>
        <ContributeDialog
          open={contributeOpen}
          onOpenChange={setContributeOpen}
          ongs={ongs}
          buildings={myDonations}
          onRequestLogin={() => setAuthOpen(true)}
          onPaid={() => setCustomizationRevision((revision) => revision + 1)}
          onViewBuilding={(donationId) => handleOpenDonation(donationId, false)}
          hideTrigger={viewingOthers || selectedBuildingId !== null}
        />
        </div>
      )}
      {booted && (loadState.status !== "ready" || !donationsApplied) && (
        <DonationLoadOverlay state={loadState} onRetry={retry} />
      )}
      {/* Faixa de 4–20px do rodapé: botões do rodapé ficam em bottom-7 (sombra desce 7px) para não cobrir. */}
      {booted && !myBuildingsOpen && (
        <p role="note" className="pointer-events-none absolute bottom-1 left-2 z-20 max-w-[calc(100%-1rem)] px-1.5 text-[11px] leading-4 text-papel">
          <strong className="font-semibold">Pré-lançamento:</strong> ONGs e contribuições são de teste
        </p>
      )}
      {!myBuildingsOpen && isAdmin && uiVisibility.cameraLog && cameraDebugInfo && (
        <div className="pixel bevel-edge absolute bottom-4 left-4 z-30 w-[min(21rem,calc(100vw-2rem))] select-text bg-background px-3 pt-2 pb-3 font-mono text-[11px] leading-5 text-muted-foreground">
          <div className="mb-1 font-sans text-xs font-semibold text-foreground">Camera default</div>
          <div>
            initialCameraPosition: {"{"} x: {formatCameraValue(cameraDebugInfo.position.x)}, y:{" "}
            {formatCameraValue(cameraDebugInfo.position.y)}, z:{" "}
            {formatCameraValue(cameraDebugInfo.position.z)} {"}"}
          </div>
          <div>
            controlTarget: {"{"} x: {formatCameraValue(cameraDebugInfo.target.x)}, y:{" "}
            {formatCameraValue(cameraDebugInfo.target.y)}, z:{" "}
            {formatCameraValue(cameraDebugInfo.target.z)} {"}"}
          </div>
        </div>
      )}
      {!myBuildingsOpen && selectedBuildingId === null && hoverInfo && (
        <div
          className="pointer-events-none fixed z-50 bg-tinta px-3 py-1.5 text-sm font-semibold text-papel"
          style={{ left: hoverInfo.x + 14, top: hoverInfo.y - 14 }}
        >
          {hoverInfo.value.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      )}
      {!myBuildingsOpen && isAdmin && loadState.status === "ready" && uiVisibility.buildingLayoutCard && (
        <BuildingLayoutCard
          settings={blockLayoutSettings}
          onChange={setBlockLayoutSettings}
          visibleLimit={visibleLimit}
          onVisibleLimitChange={setVisibleLimit}
          total={donations.length}
          onClose={() =>
            setUIVisibility((prev) => ({ ...prev, buildingLayoutCard: false }))
          }
        />
      )}
      {booted && myBuildingsOpen && !contributeOpen && !showBuildingInfo && selectedBuildingId === null && (
        <MyBuildingsNavigation
          value={currentMyBuilding?.value}
          place={currentMyBuilding?.place}
          index={myBuildingIndex}
          count={myDonations.length}
          onPrevious={() => handleStepMyBuilding(-1)}
          onNext={() => handleStepMyBuilding(1)}
          onCustomize={() => {
            setShowBuildingInfo(false);
            handleManageFromInfo("appearance");
          }}
          onDetails={() => setShowBuildingInfo(true)}
          onClose={handleCloseInfo}
        />
      )}
      {!contributeOpen && showBuildingInfo && infoBuildingId !== null && infoBuilding && (
        <BuildingInfoModal
          value={infoBuilding.value}
          ongName={infoBuilding.ongName}
          place={infoBuilding.place}
          isOwn={infoIsOwn}
          onManage={infoIsOwn ? () => handleManageFromInfo() : undefined}
          profile={infoProfile?.id === infoBuildingId && infoProfile.userId === user?.id ? infoProfile.profile : null}
          onEditProfile={infoIsOwn ? () => setProfileEditId(infoBuildingId) : undefined}
          onClose={myBuildingsOpen && currentMyBuilding ? () => setShowBuildingInfo(false) : handleCloseInfo}
        />
      )}
      {/* Sempre montado: guarda a última posição gravada pelo runtime. clamp mantém na tela, fora do HUD e do rodapé. */}
      <div
        ref={editButtonRef}
        hidden={!booted || myBuildingsOpen || contributeOpen || infoBuildingId === null}
        className="absolute z-30"
        style={{
          left: "clamp(0.75rem, var(--edit-x) + 0.5rem, 100% - 3.75rem)",
          top: "clamp(4.5rem, var(--edit-y) - 1.5rem, 100% - 8rem)",
        }}
      >
        <Button size="icon-lg" onClick={() => handleManageFromInfo("appearance")} title="Editar edifício" aria-label="Editar edifício">
          <Pencil className="size-5" />
        </Button>
      </div>
      {/* "Ver como visitante" troca o rodapé da navegação por este Voltar, no mesmo lugar. */}
      {booted && myBuildingsOpen && currentMyBuilding && !contributeOpen && showBuildingInfo && selectedBuildingId === null && (
        <div className="pointer-events-none absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center sm:bottom-6">
          <Button type="button" variant="outline" size="lg" className="pointer-events-auto has-[>svg]:px-3 max-sm:text-sm" onClick={() => setShowBuildingInfo(false)}>
            <PixelArrow className="rotate-180" />Voltar
          </Button>
        </div>
      )}
      <BuildingProfileDialog
        donationId={profileEditId}
        onClose={() => setProfileEditId(null)}
        onSaved={(id, profile) => setInfoProfile({ id, userId: user?.id, profile })}
      />
      {/* Beta: qualquer visitante, com ou sem conta, personaliza qualquer edifício. */}
      {selectedBuildingId !== null && selectedCustomization && (
        <BuildingManageDialog
          key={`${user?.id}:${selectedBuildingId}`}
          donationId={selectedBuildingId}
          initialTab={manageTab}
          catalog={editorCatalog}
          customization={selectedCustomization}
          textureSettings={textureSettings}
          onCustomizationChange={updateCustomization}
          onSaved={(id, profile) => setInfoProfile({ id, userId: user?.id, profile })}
          onClose={handleCloseManagement}
          onViewShiftChange={handleViewShift}
        />
      )}
      {!myBuildingsOpen && isAdmin && showControlPanel && (
        <CityControlPanel
          buildingSettings={buildingSettings}
          textureSettings={textureSettings}
          facadeTextures={customizationCatalog?.textures ?? []}
          groundSettings={groundSettings}
          blockLayoutSettings={blockLayoutSettings}
          terrainSettings={terrainSettings}
          lightSettings={lightSettings}
          sceneStats={sceneStats}
          lightMetrics={lightMetrics}
          onBuildingSettingsChange={setBuildingSettings}
          onTextureSettingsChange={setTextureSettings}
          onGroundSettingsChange={setGroundSettings}
          onBlockLayoutSettingsChange={setBlockLayoutSettings}
          onTerrainSettingsChange={setTerrainSettings}
          onLightSettingsChange={setLightSettings}
          environmentSettings={environmentSettings}
          reflectionSettings={reflectionSettings}
          horizonSettings={horizonSettings}
          uiVisibility={uiVisibility}
          grain={grain}
          onEnvironmentSettingsChange={setEnvironmentSettings}
          onReflectionSettingsChange={setReflectionSettings}
          onHorizonSettingsChange={setHorizonSettings}
          onUIVisibilityChange={setUIVisibility}
          onGrainChange={setGrain}
          onClose={() => setShowControlPanel(false)}
        />
      )}
      {!myBuildingsOpen && showShortcutsHelp && (
        <KeyboardShortcutsHelp
          shortcuts={shortcuts}
          onClose={() => setShowShortcutsHelp(false)}
        />
      )}
      {!myBuildingsOpen && booted && selectedBuildingId === null && (!isAdmin || !showControlPanel) && (
        <Button variant="outline" size="icon-lg" onClick={scrollToInfo} aria-label="Ver ONGs e contribuições" title="ONGs e contribuições" className={cn("absolute right-4 z-30", isAdmin ? "bottom-[5.5rem]" : "bottom-7")}>
          <PixelChevronDown />
        </Button>
      )}
      {!myBuildingsOpen && booted && isAdmin && !showControlPanel && selectedBuildingId === null && (
        <Button
          variant="outline"
          size="icon-lg"
          onClick={() => setShowControlPanel(true)}
          className="absolute bottom-7 right-4 z-30"
          title="Configurações da cena"
          aria-label="Abrir painel de configurações"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-5">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 5.889c-.502.21-.974.483-1.405.81L5.83 5.95a1.875 1.875 0 0 0-2.342.806L2.566 8.344a1.875 1.875 0 0 0 .417 2.446l1.715 1.339c-.04.31-.06.626-.06.946 0 .32.02.636.06.946l-1.715 1.339a1.875 1.875 0 0 0-.417 2.446l.922 1.588a1.875 1.875 0 0 0 2.342.806l1.815-.749c.43.327.903.6 1.405.81l.178 2.072c.151.904.933 1.567 1.85 1.567h1.844c.917 0 1.699-.663 1.85-1.567l.178-2.072c.502-.21.975-.483 1.405-.81l1.815.749a1.875 1.875 0 0 0 2.342-.806l.922-1.588a1.875 1.875 0 0 0-.417-2.446l-1.715-1.339c.04-.31.06-.626.06-.946 0-.32-.02-.636-.06-.946l1.715-1.339a1.875 1.875 0 0 0 .417-2.446l-.922-1.588a1.875 1.875 0 0 0-2.342-.806l-1.815.749a7.5 7.5 0 0 0-1.405-.81l-.178-2.072a1.875 1.875 0 0 0-1.85-1.567h-1.844ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
              fill="currentColor"
            />
          </svg>
        </Button>
      )}
    </div>
    {/* Apresentação pública independe da API, do catálogo e do WebGL. */}
    <div hidden={myBuildingsOpen}>
    <DonationInfoSection
      donations={donations}
      ongs={ongs}
      filter={filter}
      loadState={loadState}
      onFilterChange={setFilter}
      onViewOng={(ongId) => {
        setFilter({ ...filter, ongId });
        scrollToScene();
      }}
      onRetry={retry}
    />
    </div>
    {!myBuildingsOpen && inInfo && (
      <Button variant="outline" onClick={scrollToScene} title="Voltar para a cena" aria-label="Voltar para a cena" className="fixed bottom-4 right-4 z-40">
        <PixelChevronDown className="rotate-180" />
        <span className="hidden sm:inline">Voltar para a cena</span>
      </Button>
    )}
    </div>
  );
}
