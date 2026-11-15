import { useLayoutEffect, useRef } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { animate, stagger, steps, type AnimationOptions, type AnimationPlaybackControls, type DOMKeyframesDefinition } from "motion/react";
import { useAuth } from "@/hooks/useAuth";
import { markProjectStatusSeen } from "@/lib/projectStatus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ErrorMark, LOGO_PATHS, PixelArrow, PixelClose } from "@/components/ui/pixel-icon";

/** Estado do projeto (design ModalPreLancamento). Quando abre: `scheduleProjectStatus`. Fechar de qualquer jeito (botões, X, Esc, fora) = visto. */
export function ProjectStatusDialog({ open, onClose, onSignup }: { open: boolean; onClose: () => void; onSignup: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        markProjectStatusSeen();
        onClose();
      }}
    >
      {/* text-foreground: o body da cena pinta texto branco. animate-none: entrada é do `intro` (motion); movimento reduzido mantém o fade padrão. */}
      <DialogContent
        showCloseButton={false}
        className="gap-0 p-0 text-foreground raised-modal motion-safe:data-[state=open]:animate-none! sm:max-w-[520px]"
      >
        <StatusContent onSignup={onSignup} />
      </DialogContent>
    </Dialog>
  );
}

const STEPS = [
  [
    <svg key="conta" viewBox="0 0 24 24" width={28} height={28} className="block overflow-visible">
      <g data-ip>
      <circle cx="10" cy="7.6" r="4.3" fill="var(--color-verde)" />
      <path fill="var(--color-verde)" d="M2.4 21.2c0-4.8 3.4-7.7 7.6-7.7s7.6 2.9 7.6 7.7z" />
      </g>
      <g data-badge>
      <circle cx="18" cy="17.4" r="5.7" fill="var(--color-verde-100)" />
      <circle cx="18" cy="17.4" r="4.4" fill="var(--color-ambar)" />
      <path fill="var(--color-tinta)" d="M17.3 14.9h1.4v1.8h1.8v1.4h-1.8v1.8h-1.4v-1.8h-1.8v-1.4h1.8z" />
      </g>
    </svg>,
    "Criar sua conta",
  ],
  [
    <svg key="indicar" viewBox="0 0 24 24" width={28} height={28} className="block overflow-visible">
      <g data-gift>
      <path fill="var(--color-verde)" d="M4 13.6h16v6.9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <rect x="11.2" y="13.6" width="1.6" height="7.9" fill="var(--color-verde-100)" />
      <g data-lid>
      <g data-bow><path fill="var(--color-ambar)" d="M12 7.6C10.3 3.9 5.8 3 5.8 5.5c0 1.4 2.5 2.1 6.2 2.1zM12 7.6c1.7-3.7 6.2-4.6 6.2-2.1 0 1.4-2.5 2.1-6.2 2.1z" /></g>
      <path fill="var(--color-verde)" d="M2.6 8.6a1 1 0 0 1 1-1h16.8a1 1 0 0 1 1 1v3.2a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1z" />
      <rect x="11.2" y="7.6" width="1.6" height="5.2" fill="var(--color-verde-100)" />
      </g>
      </g>
    </svg>,
    "Indicar amigos e liberar recompensas",
  ],
  [
    <svg key="simular" viewBox="0 0 28 28" width={28} height={28} shapeRendering="crispEdges" className="block">
      <g data-bld>
      <path fill="#4C5358" d="M9 1h10v3h-10zM1 4h26v4h-26zM3 8h22v17h-22zM1 25h26v2h-26z" />
      <path fill="#93979A" d="M11 2h6v2h-6z" />
      <path fill="#757C7E" d="M3 5h5v1h-5zM9 5h16v1h-16z" />
      <path fill="#C7C7C7" d="M5 8h3v13h-3z" />
      <path fill="#A7A9AC" d="M5 21h3v4h-3z" />
      <path fill="#EFEAE0" d="M9 8h14v17h-14z" />
      <path fill="#C9C9CB" d="M9 8h14v1h-14zM22 8h1v17h-1zM9 24h14v1h-14z" />
      <path fill="#4C5358" d="M10 10h4v5h-4zM17 10h4v5h-4zM10 16h4v5h-4zM17 16h4v5h-4zM13 18h5v7h-5z" />
      <path fill="#A2A9B2" d="M11 11h2v3h-2zM18 11h2v3h-2zM11 17h2v3h-2zM18 17h2v3h-2z" />
      <path fill="#B5A893" d="M14 19h3v6h-3z" />
      <path fill="#4C5358" d="M16 21h1v1h-1z" />
      <rect data-wi x="11" y="11" width="2" height="3" fill="var(--color-ambar)" />
      <rect data-wi x="18" y="11" width="2" height="3" fill="var(--color-ambar)" />
      <rect data-wi x="18" y="17" width="2" height="3" fill="var(--color-ambar)" />
      </g>
    </svg>,
    "Simular uma contribuição e erguer seu edifício",
  ],
] as const;

/** Monta junto com o conteúdo do Radix: layout effect anima o diálogo (pai direto) antes da 1ª pintura. */
function StatusContent({ onSignup }: { onSignup: () => void }) {
  const { isAuthenticated } = useAuth();
  const sceneRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => intro(sceneRef.current!.parentElement!), []);

  return (
    <>
      <div ref={sceneRef} className="relative h-[210px] shrink-0 overflow-hidden bg-secondary">
        <div data-scene className="absolute inset-0">
          <svg viewBox="0 0 520 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true" className="absolute inset-0 block size-full">
            <circle data-sun cx="118" cy="62" r="24" fill="var(--color-ambar-100)" />
            <g transform="translate(60 28)">
            <g data-cloud data-x0="60">
            <path fill="var(--color-papel-claro)" d="M8 0h16v4h8v4h4v8h-36v-4h4v-4h4z" />
            </g>
            </g>
            <g transform="translate(330 52)">
            <g data-cloud data-x0="330">
            <path fill="var(--color-papel-claro)" d="M6 0h12v3h6v3h3v6h-27v-3h3v-3h3z" />
            </g>
            </g>
            <g shapeRendering="crispEdges">
            <g data-sky="119">
            <path fill="#C9D5C0" d="M4 104h44v104h-44zM1 98h50v6h-50zM15 93h16v5h-16z" />
            <path fill="#BBC8B2" d="M1 102h50v2h-50zM12 104h2v104h-2zM20 110h4v6h-4zM29 110h4v6h-4zM38 110h4v6h-4zM20 121h4v6h-4zM29 121h4v6h-4zM38 121h4v6h-4zM20 132h4v6h-4zM29 132h4v6h-4zM38 132h4v6h-4zM20 143h4v6h-4zM29 143h4v6h-4zM38 143h4v6h-4zM20 154h4v6h-4zM29 154h4v6h-4zM38 154h4v6h-4zM20 165h4v6h-4zM29 165h4v6h-4zM38 165h4v6h-4zM20 176h4v6h-4zM29 176h4v6h-4zM38 176h4v6h-4zM20 187h4v6h-4zM29 187h4v6h-4zM38 187h4v6h-4zM20 198h4v6h-4zM29 198h4v6h-4zM38 198h4v6h-4z" />
            </g>
            <g data-sky="92">
            <path fill="#C9D5C0" d="M84 126h40v82h-40zM81 120h46v6h-46z" />
            <path fill="#BBC8B2" d="M81 124h46v2h-46zM92 126h2v82h-2zM98 132h4v6h-4zM107 132h4v6h-4zM116 132h4v6h-4zM98 143h4v6h-4zM107 143h4v6h-4zM116 143h4v6h-4zM98 154h4v6h-4zM107 154h4v6h-4zM116 154h4v6h-4zM98 165h4v6h-4zM107 165h4v6h-4zM116 165h4v6h-4zM98 176h4v6h-4zM107 176h4v6h-4zM116 176h4v6h-4zM98 187h4v6h-4zM107 187h4v6h-4zM116 187h4v6h-4zM98 198h4v6h-4zM107 198h4v6h-4zM116 198h4v6h-4z" />
            </g>
            <g data-sky="138">
            <path fill="#C9D5C0" d="M146 92h46v116h-46zM143 86h52v6h-52zM159 78h19v8h-19zM164 74h9v4h-9z" />
            <path fill="#BBC8B2" d="M143 90h52v2h-52zM154 92h2v116h-2zM162 98h4v6h-4zM172 98h4v6h-4zM182 98h4v6h-4zM162 109h4v6h-4zM172 109h4v6h-4zM182 109h4v6h-4zM162 120h4v6h-4zM172 120h4v6h-4zM182 120h4v6h-4zM162 131h4v6h-4zM172 131h4v6h-4zM182 131h4v6h-4zM162 142h4v6h-4zM172 142h4v6h-4zM182 142h4v6h-4zM162 153h4v6h-4zM172 153h4v6h-4zM182 153h4v6h-4zM162 164h4v6h-4zM172 164h4v6h-4zM182 164h4v6h-4zM162 175h4v6h-4zM172 175h4v6h-4zM182 175h4v6h-4zM162 186h4v6h-4zM172 186h4v6h-4zM182 186h4v6h-4zM162 197h4v6h-4zM172 197h4v6h-4zM182 197h4v6h-4z" />
            </g>
            <g data-sky="100">
            <path fill="#C9D5C0" d="M328 118h44v90h-44zM325 112h50v6h-50z" />
            <path fill="#BBC8B2" d="M325 116h50v2h-50zM336 118h2v90h-2zM344 124h4v6h-4zM353 124h4v6h-4zM362 124h4v6h-4zM344 135h4v6h-4zM353 135h4v6h-4zM362 135h4v6h-4zM344 146h4v6h-4zM353 146h4v6h-4zM362 146h4v6h-4zM344 157h4v6h-4zM353 157h4v6h-4zM362 157h4v6h-4zM344 168h4v6h-4zM353 168h4v6h-4zM362 168h4v6h-4zM344 179h4v6h-4zM353 179h4v6h-4zM362 179h4v6h-4zM344 190h4v6h-4zM353 190h4v6h-4zM362 190h4v6h-4z" />
            </g>
            <g data-sky="123">
            <path fill="#C9D5C0" d="M420 100h44v108h-44zM417 94h50v6h-50zM431 89h16v5h-16z" />
            <path fill="#BBC8B2" d="M417 98h50v2h-50zM428 100h2v108h-2zM436 106h4v6h-4zM445 106h4v6h-4zM454 106h4v6h-4zM436 117h4v6h-4zM445 117h4v6h-4zM454 117h4v6h-4zM436 128h4v6h-4zM445 128h4v6h-4zM454 128h4v6h-4zM436 139h4v6h-4zM445 139h4v6h-4zM454 139h4v6h-4zM436 150h4v6h-4zM445 150h4v6h-4zM454 150h4v6h-4zM436 161h4v6h-4zM445 161h4v6h-4zM454 161h4v6h-4zM436 172h4v6h-4zM445 172h4v6h-4zM454 172h4v6h-4zM436 183h4v6h-4zM445 183h4v6h-4zM454 183h4v6h-4zM436 194h4v6h-4zM445 194h4v6h-4zM454 194h4v6h-4z" />
            </g>
            <g data-sky="140">
            <path fill="#C9D5C0" d="M478 90h48v118h-48zM475 84h54v6h-54zM492 76h20v8h-20zM497 72h10v4h-10z" />
            <path fill="#BBC8B2" d="M475 88h54v2h-54zM487 90h2v118h-2zM495 96h4v6h-4zM505 96h4v6h-4zM516 96h4v6h-4zM495 107h4v6h-4zM505 107h4v6h-4zM516 107h4v6h-4zM495 118h4v6h-4zM505 118h4v6h-4zM516 118h4v6h-4zM495 129h4v6h-4zM505 129h4v6h-4zM516 129h4v6h-4zM495 140h4v6h-4zM505 140h4v6h-4zM516 140h4v6h-4zM495 151h4v6h-4zM505 151h4v6h-4zM516 151h4v6h-4zM495 162h4v6h-4zM505 162h4v6h-4zM516 162h4v6h-4zM495 173h4v6h-4zM505 173h4v6h-4zM516 173h4v6h-4zM495 184h4v6h-4zM505 184h4v6h-4zM516 184h4v6h-4zM495 195h4v6h-4zM505 195h4v6h-4zM516 195h4v6h-4z" />
            </g>
            <g data-sky="95">
            <path fill="#4C5358" d="M53 117h22v7h-22z" />
            <path fill="#93979A" d="M56 120h5v4h-5zM63 120h9v4h-9z" />
            <path fill="#4C5358" d="M33 205h68v3h-68zM36 133h62v72h-62zM33 124h68v9h-68z" />
            <path fill="#757C7E" d="M36 127h12v3h-12zM51 127h47v3h-47z" />
            <path fill="#C7C7C7" d="M39 133h9v65h-9z" />
            <path fill="#A7A9AC" d="M39 198h9v7h-9z" />
            <path fill="#EFEAE0" d="M51 133h44v72h-44z" />
            <path fill="#C9C9CB" d="M51 133h44v3h-44zM93 133h2v72h-2zM51 202h44v3h-44z" />
            <path fill="#4C5358" d="M55 141h8v11h-8zM68 141h8v11h-8zM81 141h8v11h-8zM55 157h8v11h-8zM68 157h8v11h-8zM81 157h8v11h-8zM55 173h8v11h-8zM68 173h8v11h-8zM81 173h8v11h-8zM55 189h8v11h-8zM81 189h8v11h-8zM67 187h10v18h-10z" />
            <path fill="#A2A9B2" d="M57 143h4v7h-4zM70 143h4v7h-4zM83 143h4v7h-4zM57 159h4v7h-4zM70 159h4v7h-4zM83 159h4v7h-4zM57 175h4v7h-4zM70 175h4v7h-4zM83 175h4v7h-4zM57 191h4v7h-4zM83 191h4v7h-4z" />
            <path fill="#B5A893" d="M69 189h6v16h-6z" />
            <path fill="#4C5358" d="M72 196h2v2h-2z" />
            <rect data-lit x="70" y="143" width="4" height="7" fill="var(--color-ambar)" />
            <rect data-lit x="57" y="159" width="4" height="7" fill="var(--color-ambar)" />
            <rect data-lit x="83" y="175" width="4" height="7" fill="var(--color-ambar)" />
            </g>
            <g data-sky="72">
            <path fill="#4C5358" d="M115 205h66v3h-66zM118 149h60v56h-60zM115 140h66v9h-66z" />
            <path fill="#757C7E" d="M118 143h11v3h-11zM132 143h46v3h-46z" />
            <path fill="#C7C7C7" d="M121 149h8v49h-8z" />
            <path fill="#A7A9AC" d="M121 198h8v7h-8z" />
            <path fill="#EFEAE0" d="M132 149h43v56h-43z" />
            <path fill="#C9C9CB" d="M132 149h43v3h-43zM173 149h2v56h-2zM132 202h43v3h-43z" />
            <path fill="#4C5358" d="M136 157h8v11h-8zM148 157h8v11h-8zM161 157h8v11h-8zM136 173h8v11h-8zM148 173h8v11h-8zM161 173h8v11h-8zM136 189h8v11h-8zM161 189h8v11h-8zM147 187h10v18h-10z" />
            <path fill="#A2A9B2" d="M138 159h4v7h-4zM150 159h4v7h-4zM163 159h4v7h-4zM138 175h4v7h-4zM150 175h4v7h-4zM163 175h4v7h-4zM138 191h4v7h-4zM163 191h4v7h-4z" />
            <path fill="#B5A893" d="M149 189h6v16h-6z" />
            <path fill="#4C5358" d="M152 196h2v2h-2z" />
            <rect data-lit x="138" y="159" width="4" height="7" fill="var(--color-ambar)" />
            <rect data-lit x="150" y="175" width="4" height="7" fill="var(--color-ambar)" />
            </g>
            <g data-sky="122">
            <path fill="#4C5358" d="M343 205h76v3h-76zM346 117h70v88h-70zM343 108h76v9h-76z" />
            <path fill="#757C7E" d="M346 111h13v3h-13zM362 111h54v3h-54z" />
            <path fill="#4C5358" d="M366 96h29v21h-29zM372 90h17v6h-17z" />
            <path fill="#C7C7C7" d="M349 117h10v81h-10z" />
            <path fill="#A7A9AC" d="M349 198h10v7h-10z" />
            <path fill="#EFEAE0" d="M362 117h51v88h-51zM369 99h23v18h-23zM375 93h11v6h-11z" />
            <path fill="#4C5358" d="M373 102h3v5h-3zM379 102h3v5h-3zM385 102h3v5h-3z" />
            <path fill="#C9C9CB" d="M362 117h7v3h-7zM392 117h21v3h-21zM411 117h2v88h-2zM362 202h51v3h-51z" />
            <path fill="#4C5358" d="M368 125h8v11h-8zM382 125h8v11h-8zM397 125h8v11h-8zM368 141h8v11h-8zM382 141h8v11h-8zM397 141h8v11h-8zM368 157h8v11h-8zM382 157h8v11h-8zM397 157h8v11h-8zM368 173h8v11h-8zM382 173h8v11h-8zM397 173h8v11h-8zM368 189h8v11h-8zM397 189h8v11h-8zM381 187h10v18h-10z" />
            <path fill="#A2A9B2" d="M370 127h4v7h-4zM384 127h4v7h-4zM399 127h4v7h-4zM370 143h4v7h-4zM384 143h4v7h-4zM399 143h4v7h-4zM370 159h4v7h-4zM384 159h4v7h-4zM399 159h4v7h-4zM370 175h4v7h-4zM384 175h4v7h-4zM399 175h4v7h-4zM370 191h4v7h-4zM399 191h4v7h-4z" />
            <path fill="#B5A893" d="M383 189h6v16h-6z" />
            <path fill="#4C5358" d="M386 196h2v2h-2z" />
            <rect data-lit x="370" y="127" width="4" height="7" fill="var(--color-ambar)" />
            <rect data-lit x="399" y="127" width="4" height="7" fill="var(--color-ambar)" />
            <rect data-lit x="399" y="143" width="4" height="7" fill="var(--color-ambar)" />
            <rect data-lit x="370" y="159" width="4" height="7" fill="var(--color-ambar)" />
            <rect data-lit x="384" y="175" width="4" height="7" fill="var(--color-ambar)" />
            </g>
            <g data-sky="75">
            <path fill="#4C5358" d="M435 205h72v3h-72zM438 146h66v59h-66zM435 137h72v9h-72z" />
            <path fill="#757C7E" d="M438 140h12v3h-12zM453 140h51v3h-51z" />
            <path fill="#C7C7C7" d="M441 146h9v52h-9z" />
            <path fill="#A7A9AC" d="M441 198h9v7h-9z" />
            <path fill="#EFEAE0" d="M453 146h48v59h-48z" />
            <path fill="#C9C9CB" d="M453 146h48v3h-48zM499 146h2v59h-2zM453 202h48v3h-48z" />
            <path fill="#4C5358" d="M457 154h10v12h-10zM471 154h10v12h-10zM485 154h10v12h-10zM457 171h10v12h-10zM471 171h10v12h-10zM485 171h10v12h-10zM457 188h10v12h-10zM485 188h10v12h-10zM471 187h10v18h-10z" />
            <path fill="#A2A9B2" d="M459 156h6v8h-6zM473 156h6v8h-6zM487 156h6v8h-6zM459 173h6v8h-6zM473 173h6v8h-6zM487 173h6v8h-6zM459 190h6v8h-6zM487 190h6v8h-6z" />
            <path fill="#B5A893" d="M473 189h6v16h-6z" />
            <path fill="#4C5358" d="M476 196h2v2h-2z" />
            <rect data-lit x="473" y="156" width="6" height="8" fill="var(--color-ambar)" />
            <rect data-lit x="459" y="173" width="6" height="8" fill="var(--color-ambar)" />
            <rect data-lit x="459" y="190" width="6" height="8" fill="var(--color-ambar)" />
            <path fill="#4C5358" d="M461 156h2v8h-2zM459 159h6v2h-6zM475 156h2v8h-2zM473 159h6v2h-6zM489 156h2v8h-2zM487 159h6v2h-6zM461 173h2v8h-2zM459 176h6v2h-6zM475 173h2v8h-2zM473 176h6v2h-6zM489 173h2v8h-2zM487 176h6v2h-6zM461 190h2v8h-2zM459 193h6v2h-6zM489 190h2v8h-2zM487 193h6v2h-6z" />
            </g>
            </g>
            <g transform="translate(142.5 2.3) scale(0.1843)">
            <g data-half>
            <path fill="var(--color-verde)" d={LOGO_PATHS.left} />
            </g>
            <g data-half>
            <path fill="var(--color-verde)" d={LOGO_PATHS.right} />
            </g>
            <g data-dog>
            <path fill="var(--color-verde)" d={LOGO_PATHS.dog} />
            </g>
            <g data-cat>
            <path fill="var(--color-verde)" d={LOGO_PATHS.cat} />
            </g>
            </g>
            <g transform="translate(261 58)">
            <path data-spark fill="var(--color-ambar)" d="M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z" style={{ opacity: 0 }} />
            <path data-spark fill="var(--color-ambar)" d="M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z" style={{ opacity: 0 }} />
            <path data-spark fill="var(--color-papel-claro)" d="M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z" style={{ opacity: 0 }} />
            <path data-spark fill="var(--color-ambar)" d="M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z" style={{ opacity: 0 }} />
            <path data-spark fill="var(--color-ambar)" d="M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z" style={{ opacity: 0 }} />
            <path data-spark fill="var(--color-papel-claro)" d="M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z" style={{ opacity: 0 }} />
            <path data-spark fill="var(--color-ambar)" d="M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z" style={{ opacity: 0 }} />
            <path data-spark fill="var(--color-ambar)" d="M0 -5L1.3 -1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3 -1.3Z" style={{ opacity: 0 }} />
            </g>
            <rect x="-20" y="208" width="560" height="14" fill="var(--color-verde-700)" />
          </svg>
        </div>
        <DialogClose className="absolute top-[15px] right-[15px] grid size-[38px] place-items-center pixel bevel-edge bevel-w-3 bg-background transition-colors hover:bg-card">
          <PixelClose className="size-2.5" />
          <span className="sr-only">Fechar</span>
        </DialogClose>
      </div>

      <div className="flex flex-col gap-5 px-[clamp(20px,6vw,30px)] pt-[26px] pb-8">
        <div className="flex flex-col gap-2.5">
          <DialogTitle data-in className="text-[length:clamp(25px,6.6vw,31px)] font-extrabold tracking-[-0.02em] text-balance">
            Cidoe em{" "}
            <span className="relative -mx-0.5 inline-block px-[7px] whitespace-nowrap">
              <span data-mark aria-hidden="true" className="absolute inset-x-0 top-0.5 bottom-0 origin-left bg-ambar" />
              <span className="relative">pré-lançamento</span>
            </span>
          </DialogTitle>
          <DialogDescription data-in className="text-[16.5px] leading-normal text-pretty">
            Aqui, cada contribuição para ONGs de proteção animal <strong className="font-bold text-foreground">vira um edifício na cidade</strong>.
          </DialogDescription>
        </div>

        <p data-in className="flex items-center gap-3 bg-ambar-100 px-3.5 py-3 text-[15px] leading-[1.4] font-bold">
          <span data-bang className="flex">
            <ErrorMark className="mt-0 size-6 text-[13px]" />
          </span>
          Ainda não há pagamento real.
        </p>

        <div className="flex flex-col gap-3">
          <p data-in className="mono-label text-secondary-foreground">Enquanto isso, você pode:</p>
          <ul className="flex flex-col gap-3">
            {STEPS.map(([icon, label]) => (
              <li key={label} data-in className="flex items-center gap-3.5 text-base leading-[1.4] font-semibold">
                <span aria-hidden="true" className="m-0.5 grid size-11 shrink-0 place-items-center overflow-hidden pixel pixel-thin pixel-ink-verde bg-secondary">
                  {icon}
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div data-in className="flex flex-wrap gap-x-4 gap-y-3.5 pt-1.5">
          {!isAuthenticated && (
            <div data-hop className="relative flex flex-[1_1_180px]">
              <PixelArrow data-cur width={12} height={21} className="absolute top-1/2 -left-[18px] -translate-y-1/2 text-primary" />
              <DialogClose asChild>
                <Button size="lg" className="flex-1" onClick={onSignup}>
                  Criar conta
                  <ArrowRight />
                </Button>
              </DialogClose>
            </div>
          )}
          <DialogClose asChild>
            <Button variant={isAuthenticated ? "default" : "outline"} size="lg" className="flex-[1_1_180px]">
              <MapPin />
              Explorar a cidade
            </Button>
          </DialogClose>
        </div>
      </div>
    </>
  );
}

const OUT = [0.22, 1, 0.36, 1] as const;

/** Entrada do design: cartão salta e a sombra descola, cidade e logo sobem, gato pula pro telhado, texto em cascata,
 *  ícones ganham vida. Laços infinitos (nuvens, janelas, gato, ▸, pulinho do botão) até desmontar. Devolve a limpeza. */
function intro(dialog: HTMLElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const all = (s: string) => Array.from(dialog.querySelectorAll<HTMLElement>(s));
  const one = (s: string) => dialog.querySelector<HTMLElement>(s);
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const runs: AnimationPlaybackControls[] = [];
  let alive = true;
  const go = (el: Element | Element[] | null, kf: DOMKeyframesDefinition, o: AnimationOptions) => {
    if (!el || (Array.isArray(el) && !el.length)) return;
    const run = animate(el, kf, o);
    runs.push(run);
    return run;
  };
  const after = (run: AnimationPlaybackControls | undefined, fn: () => void) => void run?.finished.then(() => { if (alive) fn(); });

  // Estado inicial antes da 1ª pintura; cada animação parte dele.
  const prime = (s: string, css: (el: HTMLElement) => Partial<CSSStyleDeclaration>) => all(s).forEach((el) => Object.assign(el.style, css(el)));
  dialog.style.opacity = "0";
  dialog.style.setProperty("--drop", "0px");
  prime("[data-in]", () => ({ opacity: "0" }));
  prime("[data-mark]", () => ({ transform: "scaleX(0)" }));
  prime("[data-sun]", () => ({ transform: "translateY(40px)" }));
  prime("[data-sky]", (el) => ({ transform: `translateY(${el.dataset.sky}px)` }));
  prime("[data-lit], [data-wi]", () => ({ opacity: "0" }));
  prime("[data-half]", () => ({ transform: "translateY(1000px)" }));
  prime("[data-dog]", () => ({ transform: "translateY(420px)" }));
  prime("[data-cat]", () => ({ opacity: "0", transform: "translate(806px, 252px)" }));
  prime("[data-ip], [data-badge], [data-gift]", () => ({ transform: "scale(0)" }));
  prime("[data-bld]", () => ({ transform: "translateY(24px)" }));

  // 1 · cartão salta e a sombra dura se descola (--drop do `raised-modal`)
  go(dialog, { opacity: [0, 1] }, { duration: 0.22, delay: 0.05 });
  go(dialog, { y: [70, 0], rotate: [-4, 0], scale: [0.9, 1] }, { type: "spring", visualDuration: 0.6, bounce: 0.32, delay: 0.05 });
  go(dialog, { "--drop": ["0px", "12px"] }, { type: "spring", visualDuration: 0.45, bounce: 0.45, delay: 0.38 });

  // 2 · cidade: sol, nuvens e edifícios brotando do chão; janelas acendem e piscam de vez em quando
  go(one("[data-sun]"), { y: [40, 0] }, { duration: 0.9, ease: OUT, delay: 0.2 });
  all("[data-cloud]").forEach((cloud, i) => {
    const x0 = Number(cloud.dataset.x0), speed = 9 + i * 5;
    after(go(cloud, { x: [0, 600 - x0] }, { duration: (600 - x0) / speed, ease: "linear" }), () =>
      go(cloud, { x: [-90 - x0, 600 - x0] }, { duration: 690 / speed, ease: "linear", repeat: Infinity }));
  });
  all("[data-sky]").forEach((b, i) => go(b, { y: [Number(b.dataset.sky), 0] }, { duration: 0.6, ease: OUT, delay: 0.24 + i * 0.045 + Math.random() * 0.05 }));
  all("[data-lit]").forEach((w, i) =>
    after(go(w, { opacity: [0, 1] }, { duration: 0.01, delay: 1 + i * 0.05 + Math.random() * 0.25 }), () =>
      go(w, { opacity: [1, 0, 1] }, { duration: 0.26, ease: steps(1, "start"), repeat: Infinity, repeatDelay: rnd(2.5, 6.5), delay: rnd(1.5, 4) })));

  // 3 · logo: metades sobem, chão treme, cachorro se encaixa
  all("[data-half]").forEach((h, i) => go(h, { y: [1000, 0] }, { duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.55 + i * 0.07 }));
  go(one("[data-scene]"), { x: [0, -3, 3, -2, 1, 0], y: [0, 2, -1, 1, 0, 0] }, { duration: 0.36, ease: "linear", delay: 0.98 });
  go(one("[data-dog]"), { y: [420, 0] }, { type: "spring", visualDuration: 0.5, bounce: 0.5, delay: 1.1 });

  // 4 · gato aparece no edifício vizinho, agacha e pula pro telhado; faíscas; pulinho de vez em quando
  const cat = one("[data-cat]");
  const D = 1.15, t0 = 1.55;
  go(cat, { opacity: [0, 1] }, { duration: 0.15, delay: t0 });
  go(cat, { x: [806, 806, 0] }, { duration: D, times: [0, 0.52, 1], ease: ["linear", "linear"], delay: t0 });
  go(cat, { rotate: [0, 0, 9, -14, 0] }, { duration: D, times: [0, 0.4, 0.52, 0.8, 1], ease: "easeInOut", delay: t0 });
  after(go(cat, { y: [282, 252, 252, 264, -175, 0] }, { duration: D, times: [0, 0.18, 0.4, 0.52, 0.78, 1], ease: ["easeOut", "linear", "easeIn", "easeOut", "easeIn"], delay: t0 }), () => {
    all("[data-spark]").forEach((s, i, arr) => {
      const ang = ((-165 + (150 / (arr.length - 1)) * i) * Math.PI) / 180, r = rnd(24, 44);
      go(s, { x: [0, Math.cos(ang) * r], y: [0, Math.sin(ang) * r], scale: [0.2, 1.3, 0], opacity: [0, 1, 0], rotate: [0, 90] }, { duration: 0.75, ease: "easeOut" });
    });
    go(cat, { y: [0, -26, 0] }, { duration: 0.42, ease: ["easeOut", "easeIn"], times: [0, 0.45, 1], repeat: Infinity, repeatDelay: 4.2, delay: 2.2 });
  });

  // 5 · texto em cascata; "pré-lançamento" ganha marca-texto âmbar em degraus; "!" chacoalha
  const items = all("[data-in]");
  const base = 0.42, gap = 0.055;
  go(items, { opacity: [0, 1], y: [12, 0] }, { duration: 0.5, ease: OUT, delay: stagger(gap, { startDelay: base }) });
  go(one("[data-mark]"), { scaleX: [0, 1] }, { duration: 0.32, ease: steps(7), delay: 0.78 });
  go(one("[data-bang]"), { scale: [1, 1.35, 1, 1.35, 1], rotate: [0, -10, 0, 10, 0] }, { duration: 0.55, ease: steps(1, "start"), delay: 1.55 });

  // 6 · ícones da lista ganham vida quando a linha entra
  const at = (el: HTMLElement) => base + Math.max(0, items.indexOf(el.closest<HTMLElement>("[data-in]")!)) * gap + 0.12;
  const pop = { type: "spring", visualDuration: 0.4, bounce: 0.5 } as const;
  all("[data-ip], [data-gift]").forEach((el) => go(el, { scale: [0, 1] }, { ...pop, delay: at(el) }));
  all("[data-badge]").forEach((el) => go(el, { scale: [0, 1], rotate: [-120, 0] }, { type: "spring", visualDuration: 0.45, bounce: 0.45, delay: at(el) + 0.2 }));
  all("[data-lid]").forEach((el) => go(el, { y: [0, -5, 0, -2, 0] }, { duration: 0.6, ease: "easeOut", delay: at(el) + 0.35 }));
  all("[data-bow]").forEach((el) => go(el, { rotate: [0, -16, 12, -6, 0] }, { duration: 0.6, ease: "easeInOut", delay: at(el) + 0.4 }));
  all("[data-bld]").forEach((el) => go(el, { y: [24, 0] }, { duration: 0.45, ease: steps(8), delay: at(el) }));
  all("[data-wi]").forEach((el, i) => go(el, { opacity: [0, 1] }, { duration: 0.01, delay: at(el) + 0.5 + i * 0.12 }));

  // 7 · chamada: ▸ pisca em dois passos e o botão dá um pulinho de tempos em tempos
  go(one("[data-cur]"), { x: [0, 0, 4, 4, 0] }, { duration: 0.9, times: [0, 0.48, 0.5, 0.98, 1], ease: "linear", repeat: Infinity, delay: 1.3 });
  go(one("[data-hop]"), { y: [0, -6, 0, -2, 0] }, { duration: 0.55, ease: "easeOut", repeat: Infinity, repeatDelay: 3.6, delay: 3.2 });

  return () => {
    alive = false;
    runs.forEach((run) => run.stop());
  };
}
