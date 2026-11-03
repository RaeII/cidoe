# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cidoe is a 3D city scene editor built with React 19, Three.js, TypeScript, and Vite. It renders buildings as visual representations of donations — the highest-value donation always occupies the center of a square spiral. Configurable lighting, PBR textures, and HDRI environment are all controllable via a real-time UI panel. There is no shadow system: the scene is lit by ambient light + HDRI IBL only, so `castShadow`/`receiveShadow` flags must not be reintroduced without adding a shadow-casting light first.

## Commands

- `npm run dev` — Start Vite dev server with HMR
- `npm run build` — TypeScript compile + Vite production build
- `npm run lint` — ESLint (flat config with TypeScript + React rules)
- `npm run preview` — Preview production build

No test framework is configured.

## Architecture

Three-tier separation between React UI, Three.js rendering, and a bridge layer:

### Data Flow

```
User controls → CitySceneEditor (React state) → useCityScene hook → createCitySceneRuntime → Three.js scene
                                                                   ↑ stats feedback ↑
BuildingHeightInput → canvasRef.addDonation() → CitySceneCanvasHandle → runtime.addDonation()
```

`CitySceneEditor` is the single state holder. All settings (building, texture, ground, terrain, light, horizon, environment, blockLayout) flow down as props. No external state management — React hooks only.

`CitySceneCanvas` exposes an imperative handle (`CitySceneCanvasHandle`) with `addDonation(value)` so the editor can trigger scene actions without React state cycles.

### Key Layers

- **`src/components/html/`** — Control panel UI. Purely presentational, no Three.js imports. Each control group maps to a settings type.
- **`src/components/three/CitySceneCanvas.tsx`** — Mounts the Three.js renderer to a DOM ref via `useCityScene`. Exposes `CitySceneCanvasHandle`.
- **`src/scene/hooks/useCityScene.ts`** — Bridge layer. React effects detect settings changes and call runtime update methods. Uses `useEffectEvent` for the stats callback to avoid recreating the runtime on re-renders.
- **`src/scene/runtime/createCitySceneRuntime.ts`** — Orchestrator. Creates scene, camera, renderer, OrbitControls, and coordinates all managers/builders. Owns the animation loop with dynamic resolution scaling targeting `CITY_SCENE_CONFIG.targetFps`.
- **`src/scene/managers/createDonationManager.ts`** — Active manager. Handles the square-spiral layout of donation buildings, proportional height calculation, PBR texture loading, triplanar shader for facades, dynamic cube envMap, and distance culling of building accessories (signs, LEDs, rooftops, holograms vanish beyond 80 units). `createChunkManager` is kept for architectural reference but is not used by the runtime.
- **`src/scene/builders/`** — Factory functions: `createLightingRig`, `createGroundPlane`, `createGridHelper`, `loadEnvironment` (HDRI skybox via inverted sphere + PMREMGenerator for `scene.environment`).
- **`src/scene/config/`** — All defaults live here. Each domain has a `createDefault*Settings()` factory. `citySceneConfig.ts` holds global scene structure (chunk sizes, camera, FPS target, fog, grid, OrbitControls limits).
- **`src/scene/types.ts`** — Central type definitions for all settings interfaces and internal types (`DonationEntry`, `ChunkData`, `CitySceneConfig`, etc.).
- **`src/scene/utils/`** — Pure functions: seeded random (deterministic procedural generation), lighting angle/intensity math, ground material mapping, dev assertions.

### Patterns

- **Factory functions everywhere** — builders, managers, and runtime all use `create*()` returning objects with methods, not classes.
- **Explicit disposal** — All Three.js objects are cleaned up via `dispose()`. Always add cleanup when creating new Three.js resources.
- **Instanced meshes** — Buildings use `THREE.InstancedMesh` for performance.
- **Seeded random** — Building placement is deterministic per chunk position via `src/scene/utils/random.ts`.

## Documentation

**Writing style** — All documentation prose is written in caveman mode: drop articles/filler/hedging, fragments OK, exact technical terms. Code blocks, wikilinks, and Mermaid stay unchanged.

All docs live in a single **Obsidian Flavored Markdown** vault at `doc/` (frontmatter, wikilinks, callouts, Mermaid). On macOS's case-insensitive filesystem `Doc/` and `doc/` resolve to the **same** directory (same inode) — there is only one. The vault is organized into folders that mirror `src/`:

```
doc/
  index.md                  navigation hub (file tree + "Onde Mexer?" table + reading order)
  components/               mirrors src/components
  scene/engine/             runtime, hooks, managers, builders
  scene/foundation/         config, types, utils
```

**Whenever you change code** — add a module, rename a file, change behavior, or modify architecture — update the matching page, then register it in `doc/index.md`.

| Changed area | Doc page |
|---|---|
| New module or overall architecture | `doc/index.md` |
| HTML components / panel | `doc/components/html-components.md` |
| Canvas / Three component | `doc/components/three-components.md` |
| Scene config defaults | `doc/scene/foundation/scene-config.md` |
| Types | `doc/scene/foundation/scene-types.md` |
| Utils | `doc/scene/foundation/scene-utils.md` |
| Builders | `doc/scene/engine/scene-builders.md` |
| Building-model workflow / `scripts/render-building.mjs` | `doc/scene/engine/novo-edificio.md` |
| Managers | `doc/scene/engine/scene-managers.md` |
| Runtime | `doc/scene/engine/scene-runtime.md` |
| Hook | `doc/scene/engine/scene-hooks.md` |
| Visual: tokens (`src/index.css`), primitivos `src/components/ui/` | `doc/desingn-system/desingn-system-index.md` |

Cross-reference with Obsidian wikilinks by **filename**, not path (`[[scene-runtime]]`, `[[scene-types#BuildingSettings]]`) — they resolve from any folder, so moving a page does not break links. Filenames must stay unique across the vault.

## Building models

New or edited building shape → follow `doc/scene/engine/novo-edificio.md` (reference measuring, builder pattern, every integration point, backend catalog, checks, docs, cleanup).

- Visual check: `node scripts/render-building.mjs <shape> [--height n] [--ref img] [--slot i=hex,metal,rough]` — 4 views lit like the city. Reuse or extend it; never write a one-off render harness.
- Leave no screenshots, crops, bundles or throwaway scripts in the repo or temp dirs when done (`rm -rf "${TMPDIR:-/tmp}/cidoe-render"`). Never delete or commit the owner's reference image without asking.

## UI style

Read `doc/desingn-system/desingn-system-index.md` before touching any HTML UI. Paper plaques with pixel-notched
borders (`pixel`), solid bevels (`bevel-*`), tokens only — no `rounded-*`, `shadow-*`, blur, gradient, red, white/black or loose hex.

## UI copy

Keep interface text lean. The label says what the field is; add a description only when the label
alone is not enough — one short, direct sentence. No decorative descriptions, no long explanations,
no repeating in prose what the placeholder or label already shows.

## TypeScript

Strict mode enabled with `noUnusedLocals` and `noUnusedParameters`. Target ES2022.
