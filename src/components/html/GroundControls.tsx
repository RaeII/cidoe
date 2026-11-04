import type { GroundMaterialType, GroundSettings } from "../../scene/types";
import { ColorField } from "./controls/ColorField";
import { PanelSection } from "./controls/PanelSection";

type GroundControlsProps = {
  value: GroundSettings;
  onChange: (settings: GroundSettings) => void;
};

export function GroundControls({ value, onChange }: GroundControlsProps) {
  return (
    <PanelSection
      title="Chão"
      description="Altere o tamanho, a cor do chão e o acabamento do material."
    >
      <p className="text-xs leading-5 text-muted-foreground">
        Até onde o chão é desenhado fica em "Distância do chão", acima nesta aba: o valor vive no
        horizonte porque é ele que decide se a borda do plano aparece ou se quem corta é o alcance
        da câmera.
      </p>

      <ColorField
        label="Cor do chão"
        value={value.color}
        onChange={(color) => onChange({ ...value, color })}
        placeholder="#0d1016"
      />

      <label className="block">
        <span className="mono-label mb-2 block text-foreground">Material do chão</span>
        <select
          value={value.materialType}
          onChange={(event) =>
            onChange({ ...value, materialType: event.target.value as GroundMaterialType })
          }
          className="field h-8 w-full pl-2 text-sm"
        >
          <option value="standard">
            Standard
          </option>
          <option value="matte">
            Fosco
          </option>
          <option value="soft-metal">
            Metal suave
          </option>
          <option value="polished">
            Polido
          </option>
        </select>
      </label>
    </PanelSection>
  );
}
