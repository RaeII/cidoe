import type { BlockLayoutSettings } from "../types";

export function createDefaultBlockLayoutSettings(): BlockLayoutSettings {
  return {
    blockSize: 8,
    streetWidth: 6.0,
    towerRatio: 0.33,
    towersPerBlock: 14,
    baseHeightCap: 0.70,
    lotColor: "#404040",
    sidewalkColor: "#454545",
    sidewalkSideColor: "#292929",
    sidewalkHeight: 0.12,
    centerTallest: false,
  };
}
