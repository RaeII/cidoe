import { forwardRef, useImperativeHandle, useRef } from "react";
import { useCityScene } from "../../scene/hooks/useCityScene";
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
} from "../../scene/types";

export type CitySceneCanvasHandle = {
  addDonation: (value: number) => void;
  addDonations: (values: number[]) => void;
  setDonations: (entries: ReadonlyArray<{ id: number; value: number }>) => void;
  updateDonationCustomization: (donationId: number, customization: BuildingCustomization) => void;
  focusOnDonation: (donationId: number) => void;
  clearFocus: () => void;
};

export type CitySceneCanvasProps = {
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

export const CitySceneCanvas = forwardRef<CitySceneCanvasHandle, CitySceneCanvasProps>(
  function CitySceneCanvas(
    {
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
    },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);

    const { addDonation, addDonations, setDonations, updateDonationCustomization, focusOnDonation, clearFocus } = useCityScene({
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
    });

    useImperativeHandle(
      ref,
      () => ({ addDonation, addDonations, setDonations, updateDonationCustomization, focusOnDonation, clearFocus }),
      [addDonation, addDonations, setDonations, updateDonationCustomization, focusOnDonation, clearFocus],
    );

    return <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />;
  },
);
