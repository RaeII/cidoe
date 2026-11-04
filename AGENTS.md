# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Cidoe is a 3D city scene editor built with React 19, Three.js, TypeScript, and Vite. It renders buildings as visual representations of donations — the highest-value donation always occupies the center of a square spiral. Configurable lighting, PBR textures, HDRI environment, and shadow systems are all controllable via a real-time UI panel.

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

`CitySceneEditor` is the single state holder. All settings (building, texture, ground, light, shadow, renderDirection, environment) flow down as props. No external state management — React hooks only.

`CitySceneCanvas` exposes an imperative handle (`CitySceneCanvasHandle`) with `addDonation(value)` so the editor can trigger scene actions without React state cycles.

### Key Layers

- **`src/components/html/`** — Control panel UI. Purely presentational, no Three.js imports. Each control group maps to a settings type.
- **`src/components/three/CitySceneCanvas.tsx`** — Mounts the Three.js renderer to a DOM ref via `useCityScene`. Exposes `CitySceneCanvasHandle`.
- **`src/scene/hooks/useCityScene.ts`** — Bridge layer. React effects detect settings changes and call runtime update methods. Uses `useEffectEvent` for the stats callback to avoid recreating the runtime on re-renders.
- **`src/scene/runtime/createCitySceneRuntime.ts`** — Orchestrator. Creates scene, camera, renderer, OrbitControls, and coordinates all managers/builders. Owns the animation loop with dynamic resolution scaling targeting `CITY_SCENE_CONFIG.targetFps`.
- **`src/scene/managers/createDonationManager.ts`** — Active manager. Handles the square-spiral layout of donation buildings, proportional height calculation, PBR texture loading, triplanar shader for facades, and dynamic cube envMap. `createChunkManager` and `createShadowManager` are kept for architectural reference but are not used by the runtime.
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

**Two documentation directories must always be kept in sync:**

- `Doc/` — Plain Markdown docs in Portuguese (legacy, keep updated)
- `doc/` — **Obsidian Flavored Markdown** docs (primary). Includes frontmatter, wikilinks between files, callouts, and Mermaid diagrams.

**Whenever you change code** — add a module, rename a file, change behavior, or modify architecture — update the corresponding files in **both** `Doc/` and `doc/`.

| Changed area | Doc files to update |
|---|---|
| New module or overall architecture | `index.md` in both |
| HTML components / panel | `html-components.md` |
| Canvas / Three component | `three-components.md` |
| Scene config defaults | `scene-config.md` |
| Types | `scene-types.md` |
| Utils | `scene-utils.md` |
| Builders | `scene-builders.md` |
| Managers | `scene-managers.md` |
| Runtime | `scene-runtime.md` |
| Hook | `scene-hooks.md` |

`doc/` uses Obsidian wikilinks (`[[scene-runtime]]`, `[[scene-types#BuildingSettings]]`) to cross-reference files. Maintain these links when renaming files.

## UI copy

Keep interface text lean. The label says what the field is; add a description only when the label
alone is not enough — one short, direct sentence. No decorative descriptions, no long explanations,
no repeating in prose what the placeholder or label already shows.

## TypeScript

Strict mode enabled with `noUnusedLocals` and `noUnusedParameters`. Target ES2022.
