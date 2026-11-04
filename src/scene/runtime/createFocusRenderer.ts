import * as THREE from "three";

/** A cidade mantém profundidade normal; só o resultado do conjunto recebe opacidade. */
export function createFocusRenderer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const hasHDR = renderer.extensions?.has("EXT_color_buffer_float") ?? false;
  // O renderer r183 só aceita WebGL2; os tipos ainda incluem WebGL1.
  const gl = hasHDR ? renderer.getContext() as WebGL2RenderingContext : null;
  const antialias = gl?.getContextAttributes()?.antialias ?? false;
  const sampleCounts = antialias
    ? gl!.getInternalformatParameter(gl!.RENDERBUFFER, gl!.RGBA16F, gl!.SAMPLES) as Int32Array
    : new Int32Array(0);
  const samples = antialias ? Math.min(4, renderer.capabilities.maxSamples, Math.max(0, ...sampleCounts)) : 0;
  const supported = hasHDR && (!antialias || samples > 0);
  let target: THREE.WebGLRenderTarget | null = null;
  const size = new THREE.Vector2();
  const clearColor = new THREE.Color();
  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: { contextMap: { value: null } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `
      uniform sampler2D contextMap;
      varying vec2 vUv;
      void main() {
        vec4 context = texture2D(contextMap, vUv);
        float coverage = clamp(context.a, 0.0, 1.0);
        gl_FragColor = vec4(context.rgb / max(coverage, 0.00001), coverage * 0.15);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  overlayScene.add(new THREE.Mesh(geometry, material));

  const prepare = () => {
    if (!supported) return null;
    if (!target) {
      // Half-float conserva o HDR antes do ACES; RGBA8 cortaria reflexos e emissivos.
      target = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        samples,
      });
      material.uniforms.contextMap.value = target.texture;
    }
    renderer.getDrawingBufferSize(size);
    if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
    return target;
  };

  return {
    supported,
    get target() { return target; },
    prepare,
    render(focused: boolean) {
      if (!supported || !focused) { renderer.render(scene, camera); return; }
      const contextTarget = prepare()!;
      const mask = camera.layers.mask;
      const background = scene.background;
      const autoClear = renderer.autoClear;
      const previousTarget = renderer.getRenderTarget();
      const alpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      const lights: Array<{ light: THREE.Light; mask: number }> = [];
      scene.traverseVisible((object) => {
        const light = object as THREE.Light;
        if (!light.isLight || !light.layers.test(camera.layers)) return;
        lights.push({ light, mask: light.layers.mask });
        light.layers.enable(1); light.layers.enable(2);
      });
      try {
        scene.background = null;
        camera.layers.set(1);
        renderer.autoClear = true;
        renderer.setClearColor(0, 0);
        renderer.setRenderTarget(contextTarget);
        renderer.render(scene, camera);

        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(clearColor, alpha);
        scene.background = background;
        camera.layers.set(0);
        renderer.render(scene, camera);

        renderer.autoClear = false;
        renderer.render(overlayScene, overlayCamera);
        renderer.clearDepth();
        scene.background = null;
        camera.layers.set(2);
        renderer.render(scene, camera);
      } finally {
        camera.layers.mask = mask;
        scene.background = background;
        renderer.autoClear = autoClear;
        renderer.setClearColor(clearColor, alpha);
        renderer.setRenderTarget(previousTarget);
        for (const { light, mask } of lights) light.layers.mask = mask;
      }
    },
    dispose() { target?.dispose(); geometry.dispose(); material.dispose(); },
  };
}
