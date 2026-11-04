import { useState } from "react";
import type { BlockLayoutSettings, UIVisibilitySettings } from "../../scene/types";
import { Button } from "@/components/ui/button";

type DonationInputProps = {
  onSubmit: (value: number) => void;
  onBulkSubmit: (values: number[]) => void;
  blockLayoutSettings: BlockLayoutSettings;
  onBlockLayoutChange: (settings: BlockLayoutSettings) => void;
  visibility: UIVisibilitySettings;
};

export function BuildingHeightInput({
  onSubmit,
  onBulkSubmit,
  blockLayoutSettings,
  onBlockLayoutChange,
  visibility,
}: DonationInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [minValue, setMinValue] = useState("10");
  const [maxValue, setMaxValue] = useState("1000");
  const [quantity, setQuantity] = useState("10");

  const handleSubmit = () => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed) && parsed > 0) {
      onSubmit(parsed);
      setInputValue("");
    }
  };

  const handleBulkGenerate = () => {
    const min = parseFloat(minValue);
    const max = parseFloat(maxValue);
    const qty = parseInt(quantity, 10);
    if (isNaN(min) || isNaN(max) || isNaN(qty) || min <= 0 || max <= min || qty <= 0) return;

    console.log("Quantidade", qty);

    const values = Array.from({ length: qty }, () => min + Math.random() * (max - min));
    onBulkSubmit(values);
  };

  const inputClass = "field h-8 px-2 text-center text-sm outline-none";

  return (
    <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 flex-col items-center gap-3">
      {/* Doação individual */}
      {visibility.donationInput && (
      <div className="pixel bevel-edge flex items-center gap-2.5 bg-background px-4 pt-2.5 pb-3.5">
        <label className="mono-label text-muted-foreground">
          valor da doação
        </label>
        <input
          type="number"
          min={1}
          step={1}
          value={inputValue}
          placeholder="ex: 100"
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className={`w-28 ${inputClass}`}
        />
        <Button size="sm" onClick={handleSubmit}>
          doar
        </Button>
      </div>
      )}

      {/* Geração em lote */}
      {visibility.bulkInput && (
      <div className="pixel bevel-edge flex items-center gap-2.5 bg-background px-4 pt-2.5 pb-3.5">
        <label className="mono-label text-muted-foreground">mín</label>
        <input
          type="number"
          min={1}
          step={1}
          value={minValue}
          onChange={(e) => setMinValue(e.target.value)}
          className={`w-20 ${inputClass}`}
        />
        <label className="mono-label text-muted-foreground">máx</label>
        <input
          type="number"
          min={1}
          step={1}
          value={maxValue}
          onChange={(e) => setMaxValue(e.target.value)}
          className={`w-20 ${inputClass}`}
        />
        <label className="mono-label text-muted-foreground">qtd</label>
        <input
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={`w-16 ${inputClass}`}
          style={{ width: "100px" }}  
        />
        <Button size="sm" variant="outline" onClick={handleBulkGenerate}>
          gerar
        </Button>
      </div>
      )}

      {/* Configuração de quadras */}
      {visibility.blockLayoutInput && (
      <div className="pixel bevel-edge flex items-center gap-2.5 bg-background px-4 pt-2.5 pb-3.5">
        <label className="mono-label text-muted-foreground">bloco</label>
        <input
          type="number"
          min={1}
          max={20}
          step={1}
          value={blockLayoutSettings.blockSize}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 1) {
              onBlockLayoutChange({ ...blockLayoutSettings, blockSize: v });
            }
          }}
          className={`w-16 ${inputClass}`}
        />
        <label className="mono-label text-muted-foreground">rua</label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={blockLayoutSettings.streetWidth}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= 0) {
              onBlockLayoutChange({ ...blockLayoutSettings, streetWidth: v });
            }
          }}
          className={`w-20 ${inputClass}`}
        />
        <label className="mono-label text-muted-foreground">t/quadra</label>
        <input
          type="number"
          min={1}
          max={blockLayoutSettings.blockSize * blockLayoutSettings.blockSize}
          step={1}
          value={blockLayoutSettings.towersPerBlock}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 1) {
              onBlockLayoutChange({ ...blockLayoutSettings, towersPerBlock: v });
            }
          }}
          className={`w-16 ${inputClass}`}
        />
        <label className="mono-label text-muted-foreground">torres%</label>
        <input
          type="number"
          min={0.01}
          max={1}
          step={0.01}
          value={blockLayoutSettings.towerRatio}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0 && v <= 1) {
              onBlockLayoutChange({ ...blockLayoutSettings, towerRatio: v });
            }
          }}
          className={`w-16 ${inputClass}`}
        />
        <label className="mono-label text-muted-foreground">base%</label>
        <input
          type="number"
          min={0.05}
          max={1}
          step={0.05}
          value={blockLayoutSettings.baseHeightCap}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0 && v <= 1) {
              onBlockLayoutChange({ ...blockLayoutSettings, baseHeightCap: v });
            }
          }}
          className={`w-16 ${inputClass}`}
        />
      </div>
      )}
    </div>
  );
}
