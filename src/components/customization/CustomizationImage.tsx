import { lazy, Suspense } from "react";
import { ImageOff, ScanLine, Type } from "lucide-react";
import { PREVIEW_KIND } from "@/lib/pass";
import { resolveFacadeFolder } from "@/scene/textures/facadeTextureManifest";

const PreviewThumb = lazy(() => import("@/components/three/CustomizationPreview")
  .then((module) => ({ default: module.CustomizationThumb })));

// Miniaturas próprias das pastas; mapas _Color são removidos do build quando
// existe KTX2, que uma tag img não consegue mostrar.
const textures = import.meta.glob<string>(
  ["../../assets/texture/*/*.{png,jpg,jpeg}", "!../../assets/texture/*/*_*"],
  { query: "?url", import: "default", eager: true },
);
const textureImages = new Map(Object.entries(textures).map(([path, url]) => [path.split("/").at(-2), url]));

export function CustomizationImage({ categoryKey, optionKey, value }: {
  categoryKey: string;
  optionKey?: string;
  value?: string | null;
}) {
  const kind = PREVIEW_KIND[categoryKey];
  const fallback = <ImageOff className="size-8 text-muted-foreground/50" aria-hidden />;
  let content;
  if (kind && optionKey && optionKey !== "none") {
    content = (
      <Suspense fallback={fallback}>
        <PreviewThumb key={`${kind}:${optionKey}`} subject={{ kind, key: optionKey }} className="size-full object-contain" />
      </Suspense>
    );
  } else if (categoryKey === "color" && value) {
    content = <span className="size-2/3 pixel pixel-thin" style={{ backgroundColor: value }} />;
  } else if (categoryKey === "texture") {
    const url = textureImages.get(resolveFacadeFolder(value));
    content = url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" /> : fallback;
  } else if (categoryKey === "sign") {
    content = <Type className="size-16 text-primary" strokeWidth={1.25} aria-hidden />;
  } else if (categoryKey === "hologram") {
    content = <ScanLine className="size-16 text-primary" strokeWidth={1.25} aria-hidden />;
  } else {
    content = fallback;
  }
  return <div className="flex size-full items-center justify-center" aria-hidden>{content}</div>;
}
