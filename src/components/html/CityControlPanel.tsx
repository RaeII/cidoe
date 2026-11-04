import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PixelClose } from "@/components/ui/pixel-icon";
import type { CatalogOption } from "../../api/customizationApi";
import type {
  BlockLayoutSettings,
  BuildingSettings,
  EnvironmentSettings,
  GroundSettings,
  LightSettings,
  ReflectionSettings,
  SceneStats,
  TerrainSettings,
  TextureSettings,
  HorizonSettings,
  UIVisibilitySettings,
} from "../../scene/types";
import { BuildingControls } from "./BuildingControls";
import { EnvironmentControls } from "./EnvironmentControls";
import { GroundControls } from "./GroundControls";
import { TerrainControls } from "./TerrainControls";
import { PanelIntro } from "./PanelIntro";
import { SceneLightControls } from "./SceneLightControls";
import { TextureControls } from "./TextureControls";
import { ReflectionControls } from "./ReflectionControls";
import { HorizonControls } from "./HorizonControls";
import { PanelSection } from "./controls/PanelSection";
import { CheckboxField } from "./controls/CheckboxField";
import { ColorField } from "./controls/ColorField";
import { RangeField } from "./controls/RangeField";

type Tab = "geral" | "texturas" | "reflexo" | "luz" | "horizonte" | "terreno" | "tela";

export type CityControlPanelProps = {
  buildingSettings: BuildingSettings;
  textureSettings: TextureSettings;
  /** Texturas ativas do catálogo — alimentam o seletor de fachada. */
  facadeTextures: CatalogOption[];
  groundSettings: GroundSettings;
  blockLayoutSettings: BlockLayoutSettings;
  terrainSettings: TerrainSettings;
  lightSettings: LightSettings;
  environmentSettings: EnvironmentSettings;
  reflectionSettings: ReflectionSettings;
  horizonSettings: HorizonSettings;
  uiVisibility: UIVisibilitySettings;
  /** Granulado de renderização: 0 = resolução nativa travada (padrão), 1 = downscale agressivo sob carga. */
  grain: number;
  sceneStats: SceneStats;
  lightMetrics: {
    ambientDynamic: number;
    ambientTotal: number;
    solarIntensity: number;
  };
  onBuildingSettingsChange: (settings: BuildingSettings) => void;
  onTextureSettingsChange: (settings: TextureSettings) => void;
  onGroundSettingsChange: (settings: GroundSettings) => void;
  onBlockLayoutSettingsChange: (settings: BlockLayoutSettings) => void;
  onTerrainSettingsChange: (settings: TerrainSettings) => void;
  onLightSettingsChange: (settings: LightSettings) => void;
  onEnvironmentSettingsChange: (settings: EnvironmentSettings) => void;
  onReflectionSettingsChange: (settings: ReflectionSettings) => void;
  onHorizonSettingsChange: (settings: HorizonSettings) => void;
  onUIVisibilityChange: (settings: UIVisibilitySettings) => void;
  onGrainChange: (grain: number) => void;
  onClose: () => void;
};

export function CityControlPanel({
  buildingSettings,
  textureSettings,
  facadeTextures,
  groundSettings,
  blockLayoutSettings,
  terrainSettings,
  lightSettings,
  environmentSettings,
  reflectionSettings,
  horizonSettings,
  uiVisibility,
  grain,
  sceneStats,
  lightMetrics,
  onBuildingSettingsChange,
  onTextureSettingsChange,
  onGroundSettingsChange,
  onBlockLayoutSettingsChange,
  onTerrainSettingsChange,
  onLightSettingsChange,
  onEnvironmentSettingsChange,
  onReflectionSettingsChange,
  onHorizonSettingsChange,
  onUIVisibilityChange,
  onGrainChange,
  onClose,
}: CityControlPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("geral");

  return (
    <div className="pixel bevel-edge absolute right-0 top-0 z-[35] flex h-full w-full max-w-[360px] flex-col bg-background text-foreground">
      <div className="flex items-start border-b border-border">
        {/* 7 abas não cabem em 360px numa linha: quebram em duas. */}
        <div className="flex flex-1 flex-wrap">
          {(["geral", "texturas", "reflexo", "luz", "horizonte", "terreno", "tela"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-active={activeTab === tab}
              className="tab flex-auto px-2.5 py-2.5 text-xs capitalize hover:bg-accent"
            >
              {tab}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="m-1"
          title="Fechar painel"
          aria-label="Fechar painel"
        >
          <PixelClose className="size-3" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTab === "geral" && (
          <div className="space-y-6 pb-8 pt-2">
            <PanelIntro sceneStats={sceneStats} solarIntensity={lightMetrics.solarIntensity} />
            <BuildingControls value={buildingSettings} onChange={onBuildingSettingsChange} />
            <PanelSection
              title="Quadras"
              description="Cor dos lotes vazios do loteamento (quadras esperando edifício)."
            >
              <ColorField
                label="Cor das quadras"
                value={blockLayoutSettings.lotColor}
                onChange={(lotColor) =>
                  onBlockLayoutSettingsChange({ ...blockLayoutSettings, lotColor })
                }
                placeholder="#5b5048"
              />
            </PanelSection>
            <PanelSection
              title="Calçada"
              description="Meio-fio elevado em volta das quadras."
            >
              <ColorField
                label="Cor da calçada (topo)"
                value={blockLayoutSettings.sidewalkColor}
                onChange={(sidewalkColor) =>
                  onBlockLayoutSettingsChange({ ...blockLayoutSettings, sidewalkColor })
                }
                placeholder="#9a9da3"
              />
              <ColorField
                label="Cor da lateral (sombra)"
                value={blockLayoutSettings.sidewalkSideColor}
                onChange={(sidewalkSideColor) =>
                  onBlockLayoutSettingsChange({ ...blockLayoutSettings, sidewalkSideColor })
                }
                placeholder="#55575c"
              />
              <RangeField
                label="Altura da calçada"
                value={blockLayoutSettings.sidewalkHeight}
                min={0.02}
                max={0.4}
                step={0.01}
                valueLabel={blockLayoutSettings.sidewalkHeight.toFixed(2)}
                onChange={(sidewalkHeight) =>
                  onBlockLayoutSettingsChange({ ...blockLayoutSettings, sidewalkHeight })
                }
              />
            </PanelSection>
            <EnvironmentControls value={environmentSettings} onChange={onEnvironmentSettingsChange} />
          </div>
        )}

        {activeTab === "texturas" && (
          <div className="space-y-6 pb-8 pt-2">
            <TextureControls value={textureSettings} facadeTextures={facadeTextures} onChange={onTextureSettingsChange} />
          </div>
        )}

        {activeTab === "reflexo" && (
          <div className="space-y-6 pb-8 pt-2">
            <ReflectionControls
              value={reflectionSettings}
              textureSettings={textureSettings}
              onChange={onReflectionSettingsChange}
              onTextureSettingsChange={onTextureSettingsChange}
            />
          </div>
        )}

        {activeTab === "luz" && (
          <div className="space-y-6 pb-8 pt-2">
            <SceneLightControls
              value={lightSettings}
              metrics={lightMetrics}
              onChange={onLightSettingsChange}
            />
          </div>
        )}

        {activeTab === "horizonte" && (
          <div className="space-y-6 pb-8 pt-2">
            <HorizonControls
              settings={horizonSettings}
              onChange={onHorizonSettingsChange}
              culledCount={sceneStats.culled}
            />
            <GroundControls value={groundSettings} onChange={onGroundSettingsChange} />
          </div>
        )}

        {activeTab === "terreno" && (
          <div className="space-y-6 pb-8 pt-2">
            <TerrainControls value={terrainSettings} onChange={onTerrainSettingsChange} />
          </div>
        )}

        {activeTab === "tela" && (
          <div className="space-y-6 pb-8 pt-2">
            <PanelSection
              title="Componentes da tela"
              description="Ativa ou esconde os elementos sobrepostos na cena. Preferência salva automaticamente."
            >
              <div className="space-y-2">
                <CheckboxField
                  label="Log de posição da câmera"
                  checked={uiVisibility.cameraLog}
                  onChange={(cameraLog) => onUIVisibilityChange({ ...uiVisibility, cameraLog })}
                />
                <CheckboxField
                  label="Input de doação individual"
                  checked={uiVisibility.donationInput}
                  onChange={(donationInput) =>
                    onUIVisibilityChange({ ...uiVisibility, donationInput })
                  }
                />
                <CheckboxField
                  label="Input de geração em lote"
                  checked={uiVisibility.bulkInput}
                  onChange={(bulkInput) => onUIVisibilityChange({ ...uiVisibility, bulkInput })}
                />
                <CheckboxField
                  label="Input de configuração de quadras"
                  checked={uiVisibility.blockLayoutInput}
                  onChange={(blockLayoutInput) =>
                    onUIVisibilityChange({ ...uiVisibility, blockLayoutInput })
                  }
                />
                <CheckboxField
                  label="Card de organização dos edifícios"
                  checked={uiVisibility.buildingLayoutCard}
                  onChange={(buildingLayoutCard) =>
                    onUIVisibilityChange({ ...uiVisibility, buildingLayoutCard })
                  }
                />
              </div>
            </PanelSection>
            <PanelSection
              title="Granulado"
              description="Quando a cena pesa, o render cai de resolução e a imagem fica granulada. 0 trava na resolução nativa (sem granulado); acima disso, troca nitidez por FPS."
            >
              <RangeField
                label="Granulado sob carga"
                value={grain}
                min={0}
                max={1}
                step={0.05}
                valueLabel={grain === 0 ? "desligado" : grain.toFixed(2)}
                onChange={onGrainChange}
              />
            </PanelSection>
          </div>
        )}
      </div>
    </div>
  );
}
