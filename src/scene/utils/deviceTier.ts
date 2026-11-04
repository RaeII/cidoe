type NavigatorWithMemory = Navigator & { deviceMemory?: number };

/**
 * Celular/tablet (toque) ou máquina modesta (≤4 núcleos ou ≤4 GB): cena em modo leve —
 * texturas menores, DPR menor, menos trabalho por frame. Lido uma vez no carregamento.
 */
export const IS_LOW_TIER =
  typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse)").matches ||
    (navigator.hardwareConcurrency ?? 8) <= 4 ||
    ((navigator as NavigatorWithMemory).deviceMemory ?? 8) <= 4);

/**
 * WebGL rodando na CPU (SwiftShader, llvmpipe, WARP): sem GPU de verdade e sem
 * KHR_parallel_shader_compile, cada shader PBR trava a main thread por segundos.
 * A cena desiste (ver createCitySceneRuntime): loading sai, home segue sem 3D.
 */
export function isSoftwareGL(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}
