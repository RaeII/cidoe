import { getSearchRadius } from "./math";
import { pickIndex } from "./random";
import { getGroundMaterialValues } from "./materials";
import { getDynamicAmbientIntensity, getSolarIntensityFromElevation } from "./lighting";

let hasRun = false;

export function runDevAssertionsOnce() {
  if (hasRun || typeof window === "undefined") {
    return;
  }

  hasRun = true;

  console.assert(getSearchRadius(4, { forwardDistance: 14, sideDistance: 2, backwardDistance: 1 }) === 14,
    "getSearchRadius should honor the largest configured distance");
  console.assert(getSearchRadius(6, { forwardDistance: 2, sideDistance: 3, backwardDistance: 1 }) === 6,
    "getSearchRadius should keep base radius when it is larger");

  const matte = getGroundMaterialValues(0.2, 0.8, "matte");
  console.assert(matte.roughness === 1 && matte.metalness === 0, "matte preset failed");

  const polished = getGroundMaterialValues(0.9, 0.01, "polished");
  console.assert(polished.roughness <= 0.22, "polished roughness clamp failed");

  const softMetal = getGroundMaterialValues(0.05, 0.1, "soft-metal");
  console.assert(softMetal.roughness >= 0.18, "soft-metal roughness minimum failed");
  console.assert(softMetal.metalness >= 0.35, "soft-metal metalness minimum failed");

  const solar0 = getSolarIntensityFromElevation(0, 20);
  const solar90 = getSolarIntensityFromElevation(90, 20);
  const solarNegative = getSolarIntensityFromElevation(-30, 20);
  console.assert(solar0 === 0, "solar intensity at 0deg should be 0");
  console.assert(Math.abs(solar90 - 20) < 0.001, "solar intensity at 90deg should be max");
  console.assert(solarNegative === 0, "solar intensity should not go below zero");

  const ambientMin = getDynamicAmbientIntensity(0, 20, 4, 8);
  const ambientMax = getDynamicAmbientIntensity(20, 20, 4, 8);
  console.assert(ambientMin === 4, "dynamic ambient should be 4 with no solar");
  console.assert(ambientMax === 8, "dynamic ambient should clamp to 8 at max solar");

  // Sorteio de textura por edifício (ver createDonationManager#facadeGroupFor):
  // sempre dentro do pool, estável por id e espalhado por todas as texturas.
  const drawn = new Set<number>();
  let inRange = true;
  for (let id = 0; id < 500; id++) {
    const index = pickIndex(id, 37, 11);
    if (index < 0 || index > 10) inRange = false;
    drawn.add(index);
  }
  console.assert(inRange, "pickIndex should stay inside the pool");
  console.assert(drawn.size === 11, "pickIndex should reach every texture of the pool");
  console.assert(pickIndex(7, 37, 11) === pickIndex(7, 37, 11), "pickIndex should be stable per id");
  console.assert(pickIndex(7, 37, 0) === 0, "pickIndex should fall back to 0 on an empty pool");
}
