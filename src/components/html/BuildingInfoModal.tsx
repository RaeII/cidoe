import type { BuildingProfile } from "@/api/contributionApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PixelClose, PixelDog } from "@/components/ui/pixel-icon";
import { Photo } from "@/components/ui/photo";

export type BuildingInfoModalProps = {
  value: number;
  ongName?: string;
  /** "Cidade · UF". */
  place?: string;
  isOwn: boolean;
  /** Ausente = só leitura: edifício de outra pessoa (ou sem sessão). */
  onManage?: () => void;
  /** Imagem, nome e descrição; chega depois do clique (null = sem perfil). */
  profile?: BuildingProfile | null;
  /** Ausente = só leitura. */
  onEditProfile?: () => void;
  onClose: () => void;
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function BuildingInfoModal({
  value,
  ongName,
  place,
  isOwn,
  onManage,
  profile,
  onEditProfile,
  onClose,
}: BuildingInfoModalProps) {
  return (
    // Overlay sem dim/blur e pointer-events-none: cena visível e interativa atrás.
    <div className="pointer-events-none absolute inset-0 z-40 flex items-start justify-end p-4 pt-18 min-[900px]:p-6 min-[900px]:pt-32">
      <div
        role="dialog"
        aria-label="Informações do edifício"
        className="pixel bevel-edge pointer-events-auto relative w-full max-w-xs bg-background px-4 pt-3 pb-4 text-foreground min-[900px]:w-80 min-[900px]:max-w-sm min-[900px]:px-5 min-[900px]:pt-4 min-[900px]:pb-5"
      >
        {/* Mascote espiando por cima da placa; só no layout largo (no estreito encostaria no HUD do topo). */}
        <PixelDog className="absolute -top-[55px] right-8 hidden min-[900px]:block" />
        <div className="flex items-center justify-between gap-3">
          <span className="mono-label text-primary">
            {isOwn ? "Seu edifício" : "Edifício"}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="-mr-1.5"
            title="Fechar"
            aria-label="Fechar informações do edifício"
          >
            <PixelClose className="size-3" />
          </Button>
        </div>

        {profile?.image && (
          <Photo
            ratio="3/2"
            src={profile.image}
            alt={profile.name ?? "Imagem do edifício"}
            className="mt-4 mb-1 w-full"
          />
        )}
        {profile?.name && (
          <div className="mt-3 text-xl font-semibold tracking-[-0.01em] break-words">{profile.name}</div>
        )}

        {place && <div className="truncate text-sm text-muted-foreground">{place}</div>}

        {profile?.description && (
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line break-words">{profile.description}</p>
        )}

        {ongName && (
          <Badge variant="muted" className="mt-3 max-w-full">
            <span className="truncate">{ongName}</span>
          </Badge>
        )}

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="text-3xl font-semibold tracking-[-0.02em]">{formatCurrency(value)}</div>
          {onManage && (
            <Button
              onClick={onManage}
              className="h-11"
              title="Administrar edifício"
              aria-label="Administrar edifício"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                />
              </svg>
              Administrar
            </Button>
          )}
        </div>

        {onEditProfile && (
          <Button
            type="button"
            variant="link"
            onClick={onEditProfile}
            className="mt-2 h-11 px-0 pb-0"
          >
            {profile?.name || profile?.image || profile?.description ? "Editar nome e imagem" : "Adicionar nome e imagem"}
          </Button>
        )}
      </div>
    </div>
  );
}
