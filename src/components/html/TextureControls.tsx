import type { CatalogOption } from "../../api/customizationApi";
import type { TextureSettings } from "../../scene/types";
import { CheckboxField } from "./controls/CheckboxField";
import { PanelSection } from "./controls/PanelSection";
import { RangeField } from "./controls/RangeField";

type TextureControlsProps = {
  value: TextureSettings;
  /** Texturas ativas do catálogo (backend). Seleção troca a fachada de toda a cena. */
  facadeTextures: CatalogOption[];
  onChange: (settings: TextureSettings) => void;
};

export function TextureControls({ value, facadeTextures, onChange }: TextureControlsProps) {
  return (
    <>
    <PanelSection
      title="Texturas dos edifícios"
      description="Controla as texturas PBR aplicadas nos edifícios. Clay Render ativa o efeito de espelhamento nas superfícies."
    >
      {facadeTextures.length > 0 && (
        <div>
          <span className="mono-label mb-2 block text-foreground">Textura da fachada</span>
          <div className="grid grid-cols-2 gap-2.5">
            {facadeTextures.map((tex) => {
              const selected = value.textureKey === tex.value;
              return (
                <button
                  key={tex.id}
                  onClick={() => tex.value && onChange({ ...value, textureKey: tex.value })}
                  className={`pixel pixel-thin bevel-w-3 px-3 pt-1.5 pb-2 text-xs font-semibold transition-colors ${
                    selected
                      ? "bevel-verde-700 bg-primary text-primary-foreground"
                      : "bevel-edge bg-card text-foreground hover:bg-accent"
                  }`}
                >
                  {tex.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <CheckboxField
        label="Texturas ativadas"
        checked={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
      />

      <CheckboxField
        label="Textura aleatória por edifício"
        checked={value.randomPerBuilding}
        onChange={(randomPerBuilding) => onChange({ ...value, randomPerBuilding })}
      />

      <CheckboxField
        label="Clay Render"
        checked={value.clayRender}
        onChange={(clayRender) => onChange({ ...value, clayRender })}
      />

      <RangeField
        label="Normal Scale"
        value={value.normalScale}
        min={0}
        max={20}
        step={1}
        valueLabel={value.normalScale.toFixed(1)}
        onChange={(normalScale) => onChange({ ...value, normalScale })}
      />

      <RangeField
        label="Displacement Scale"
        value={value.displacementScale}
        min={0}
        max={0.5}
        step={0.001}
        valueLabel={value.displacementScale.toFixed(3)}
        onChange={(displacementScale) => onChange({ ...value, displacementScale })}
      />

      <RangeField
        label="Tiling Scale"
        value={value.tilingScale}
        min={0.1}
        max={10}
        step={0.1}
        valueLabel={value.tilingScale.toFixed(1)}
        onChange={(tilingScale) => onChange({ ...value, tilingScale })}
      />

      <RangeField
        label="Roughness Intensity"
        value={value.roughnessIntensity}
        min={0}
        max={100}
        step={1}
        valueLabel={value.roughnessIntensity.toFixed(2)}
        onChange={(roughnessIntensity) => onChange({ ...value, roughnessIntensity })}
      />

      <RangeField
        label="Metalness Intensity"
        value={value.metalnessIntensity}
        min={0}
        max={10}
        step={0.001}
        valueLabel={value.metalnessIntensity.toFixed(2)}
        onChange={(metalnessIntensity) => onChange({ ...value, metalnessIntensity })}
      />

      <RangeField
        label="Env Map Intensity"
        value={value.envMapIntensity}
        min={0}
        max={5}
        step={0.1}
        valueLabel={value.envMapIntensity.toFixed(1)}
        onChange={(envMapIntensity) => onChange({ ...value, envMapIntensity })}
      />

      <RangeField
        label="Emissive Intensity"
        value={value.emissiveIntensity}
        min={0}
        max={3}
        step={0.01}
        valueLabel={value.emissiveIntensity.toFixed(2)}
        onChange={(emissiveIntensity) => onChange({ ...value, emissiveIntensity })}
      />
    </PanelSection>

    <PanelSection
      title="Textura do topo (Concreto)"
      description="Controla a textura PBR aplicada no topo dos edifícios."
    >
      <RangeField
        label="Normal Scale"
        value={value.top.normalScale}
        min={0}
        max={20}
        step={1}
        valueLabel={value.top.normalScale.toFixed(1)}
        onChange={(normalScale) =>
          onChange({ ...value, top: { ...value.top, normalScale } })
        }
      />

      <RangeField
        label="Displacement Scale"
        value={value.top.displacementScale}
        min={0}
        max={0.5}
        step={0.001}
        valueLabel={value.top.displacementScale.toFixed(3)}
        onChange={(displacementScale) =>
          onChange({ ...value, top: { ...value.top, displacementScale } })
        }
      />

      <RangeField
        label="Tiling Scale"
        value={value.top.tilingScale}
        min={0.1}
        max={10}
        step={0.1}
        valueLabel={value.top.tilingScale.toFixed(1)}
        onChange={(tilingScale) =>
          onChange({ ...value, top: { ...value.top, tilingScale } })
        }
      />

      <RangeField
        label="Roughness Intensity"
        value={value.top.roughnessIntensity}
        min={0}
        max={100}
        step={1}
        valueLabel={value.top.roughnessIntensity.toFixed(2)}
        onChange={(roughnessIntensity) =>
          onChange({ ...value, top: { ...value.top, roughnessIntensity } })
        }
      />

      <RangeField
        label="Metalness Intensity"
        value={value.top.metalnessIntensity}
        min={0}
        max={10}
        step={0.001}
        valueLabel={value.top.metalnessIntensity.toFixed(2)}
        onChange={(metalnessIntensity) =>
          onChange({ ...value, top: { ...value.top, metalnessIntensity } })
        }
      />

      <RangeField
        label="Env Map Intensity"
        value={value.top.envMapIntensity}
        min={0}
        max={5}
        step={0.1}
        valueLabel={value.top.envMapIntensity.toFixed(1)}
        onChange={(envMapIntensity) =>
          onChange({ ...value, top: { ...value.top, envMapIntensity } })
        }
      />
    </PanelSection>
    </>
  );
}
