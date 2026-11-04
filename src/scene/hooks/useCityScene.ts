import { useCallback, useEffect, useEffectEvent, useRef, type RefObject } from "react";
import { createCitySceneRuntime, type CitySceneRuntime } from "../runtime/createCitySceneRuntime";
import { DEFAULT_SCENE_STATS } from "../config/citySceneConfig";
import type {
  BlockLayoutSettings,
  BuildingCustomization,
  BuildingSettings,
  CameraDebugInfo,
  EnvironmentSettings,
  GroundSettings,
  LightSettings,
  ReflectionSettings,
  SceneStats,
  TerrainSettings,
  TextureSettings,
  HorizonSettings,
} from "../types";

type UseCitySceneOptions = {
  mountRef: RefObject<HTMLDivElement | null>;
  buildingSettings: BuildingSettings;
  textureSettings: TextureSettings;
  groundSettings: GroundSettings;
  terrainSettings: TerrainSettings;
  lightSettings: LightSettings;
  horizonSettings: HorizonSettings;
  environmentSettings: EnvironmentSettings;
  reflectionSettings: ReflectionSettings;
  blockLayoutSettings: BlockLayoutSettings;
  /** Texturas sorteáveis por edifício (values do catálogo). Vazio = textura global em tudo. */
  facadeTexturePool: readonly string[];
  /** Granulado de renderização: 0 = resolução nativa travada, 1 = downscale agressivo sob carga. */
  grain: number;
  onStatsChange: (stats: SceneStats) => void;
  onCameraDebugChange?: (cameraInfo: CameraDebugInfo) => void;
  onHoverChange?: (value: number | null, x: number, y: number) => void;
  onBuildingClick?: (donationId: number | null) => void;
};

export function useCityScene({
  mountRef,
  buildingSettings,
  textureSettings,
  groundSettings,
  terrainSettings,
  lightSettings,
  horizonSettings,
  environmentSettings,
  reflectionSettings,
  blockLayoutSettings,
  facadeTexturePool,
  grain,
  onStatsChange,
  onCameraDebugChange,
  onHoverChange,
  onBuildingClick,
}: UseCitySceneOptions) {
  const runtimeRef = useRef<CitySceneRuntime | null>(null);
  // Settings mais recentes. O runtime nasce assíncrono (em etapas): o que mudar durante a
  // criação é reaplicado quando ele sobe (os effects abaixo viram no-op enquanto não há runtime).
  const settings = {
    buildingSettings,
    textureSettings,
    groundSettings,
    terrainSettings,
    lightSettings,
    horizonSettings,
    environmentSettings,
    reflectionSettings,
    blockLayoutSettings,
    facadeTexturePool,
    grain,
  };
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });
  // Chamadas imperativas (doações, customização, foco) feitas antes do runtime subir:
  // reaplicadas na ordem. null = cena indisponível, descarta.
  const pendingCallsRef = useRef<Array<(runtime: CitySceneRuntime) => void> | null>([]);
  const callRuntime = useCallback((call: (runtime: CitySceneRuntime) => void) => {
    if (runtimeRef.current) call(runtimeRef.current);
    else pendingCallsRef.current?.push(call);
  }, []);

  const handleStatsChange = useEffectEvent((stats: SceneStats) => {
    onStatsChange(stats);
  });

  const handleCameraDebugChange = useEffectEvent((cameraInfo: CameraDebugInfo) => {
    onCameraDebugChange?.(cameraInfo);
  });

  const handleHoverChange = useEffectEvent(
    (value: number | null, x: number, y: number) => {
      onHoverChange?.(value, x, y);
    },
  );

  const handleBuildingClick = useEffectEvent(
    (donationId: number | null) => {
      onBuildingClick?.(donationId);
    },
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    let cancelled = false;
    let runtime: CitySceneRuntime | null = null;
    const initial = settingsRef.current;
    void (async () => {
      // Sem WebGL (robôs, verificação do Google, GPU bloqueada) ou com WebGL por software o
      // runtime rejeita: sem o catch o React desmonta a página inteira. Cena fica vazia e
      // sceneReady libera o loading — nada mais vai carregar; resto da home segue.
      try {
        runtime = await createCitySceneRuntime({
          mount,
          ...initial,
          onStatsChange: (stats) => handleStatsChange(stats),
          onCameraDebugChange: (cameraInfo) => handleCameraDebugChange(cameraInfo),
          onHoverChange: (value, x, y) => handleHoverChange(value, x, y),
          onBuildingClick: (donationId) => handleBuildingClick(donationId),
        });
      } catch (error) {
        console.warn("Cena 3D indisponível:", error);
        pendingCallsRef.current = null;
        if (!cancelled) handleStatsChange({ ...DEFAULT_SCENE_STATS, sceneReady: true });
        return;
      }
      if (cancelled) {
        runtime.dispose();
        return;
      }
      runtimeRef.current = runtime;
      // O que mudou enquanto o runtime nascia. Pool e granulado não entram na criação.
      const latest = settingsRef.current;
      if (latest.buildingSettings !== initial.buildingSettings) runtime.updateBuildingSettings(latest.buildingSettings);
      if (latest.textureSettings !== initial.textureSettings) runtime.updateTextureSettings(latest.textureSettings);
      if (latest.groundSettings !== initial.groundSettings) runtime.updateGroundSettings(latest.groundSettings);
      if (latest.terrainSettings !== initial.terrainSettings) runtime.updateTerrainSettings(latest.terrainSettings);
      if (latest.lightSettings !== initial.lightSettings) runtime.updateLightSettings(latest.lightSettings);
      if (latest.horizonSettings !== initial.horizonSettings) runtime.updateHorizonSettings(latest.horizonSettings);
      if (latest.environmentSettings !== initial.environmentSettings) runtime.updateEnvironmentSettings(latest.environmentSettings);
      if (latest.reflectionSettings !== initial.reflectionSettings) runtime.updateReflectionSettings(latest.reflectionSettings);
      if (latest.blockLayoutSettings !== initial.blockLayoutSettings) runtime.updateBlockLayout(latest.blockLayoutSettings);
      runtime.setFacadeTexturePool(latest.facadeTexturePool);
      runtime.setGrain(latest.grain);
      const pending = pendingCallsRef.current ?? [];
      pendingCallsRef.current = [];
      for (const call of pending) call(runtime);
    })();

    return () => {
      cancelled = true;
      runtimeRef.current = null;
      runtime?.dispose();
    };
  }, [mountRef]);

  useEffect(() => {
    runtimeRef.current?.updateBuildingSettings(buildingSettings);
  }, [buildingSettings]);

  useEffect(() => {
    runtimeRef.current?.updateTextureSettings(textureSettings);
  }, [textureSettings]);

  // Catálogo chega depois do mount (fetch): o pool entra por efeito, não no setup.
  useEffect(() => {
    runtimeRef.current?.setFacadeTexturePool(facadeTexturePool);
  }, [facadeTexturePool]);

  useEffect(() => {
    runtimeRef.current?.updateGroundSettings(groundSettings);
  }, [groundSettings]);

  useEffect(() => {
    runtimeRef.current?.updateTerrainSettings(terrainSettings);
  }, [terrainSettings]);

  useEffect(() => {
    runtimeRef.current?.updateLightSettings(lightSettings);
  }, [lightSettings]);

  useEffect(() => {
    runtimeRef.current?.updateHorizonSettings(horizonSettings);
  }, [horizonSettings]);

  useEffect(() => {
    runtimeRef.current?.updateEnvironmentSettings(environmentSettings);
  }, [environmentSettings]);

  useEffect(() => {
    runtimeRef.current?.updateReflectionSettings(reflectionSettings);
  }, [reflectionSettings]);

  useEffect(() => {
    runtimeRef.current?.updateBlockLayout(blockLayoutSettings);
  }, [blockLayoutSettings]);

  useEffect(() => {
    runtimeRef.current?.setGrain(grain);
  }, [grain]);

  // Referência estável: delega ao runtime atual sem recriar a função
  const addDonation = useCallback((value: number) => {
    callRuntime((runtime) => runtime.addDonation(value));
  }, [callRuntime]);

  const addDonations = useCallback((values: number[]) => {
    callRuntime((runtime) => runtime.addDonations(values));
  }, [callRuntime]);

  const setDonations = useCallback(
    (entries: ReadonlyArray<{ id: number; value: number }>) => {
      callRuntime((runtime) => runtime.setDonations(entries));
    },
    [callRuntime],
  );

  const updateDonationCustomization = useCallback(
    (donationId: number, customization: BuildingCustomization) => {
      callRuntime((runtime) => runtime.updateDonationCustomization(donationId, customization));
    },
    [callRuntime],
  );

  const focusOnDonation = useCallback((donationId: number) => {
    callRuntime((runtime) => runtime.focusOnDonation(donationId));
  }, [callRuntime]);

  const clearFocus = useCallback(() => {
    callRuntime((runtime) => runtime.clearFocus());
  }, [callRuntime]);

  return { addDonation, addDonations, setDonations, updateDonationCustomization, focusOnDonation, clearFocus };
}
