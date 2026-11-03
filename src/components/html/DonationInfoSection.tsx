import { useMemo, type ReactNode } from "react";
import { MapPinIcon } from "lucide-react";
import type { DonationRecord, Ong } from "@/api/donationApi";
import type { DonationFilter, DonationsLoadState } from "@/components/hooks/useDonations";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BlockLoader, ErrorMark, PixelArrow, PixelBuilding, PixelDog, PixelPaw } from "@/components/ui/pixel-icon";
import { Photo } from "@/components/ui/photo";
import { PublicPageNav } from "@/components/PublicPageNav";
import { cn } from "@/lib/utils";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
import { ABOUT_PATH } from "@/lib/seo";
import { formatBRL } from "@/lib/unlock";

type DonationInfoSectionProps = {
  donations: readonly DonationRecord[];
  ongs: readonly Ong[];
  filter: DonationFilter;
  loadState: DonationsLoadState;
  onFilterChange: (filter: DonationFilter) => void;
  onViewOng: (id: number) => void;
  onRetry: () => void;
};

const ONG_LIMIT = 6;

/** Cabeçalho de seção do DS: pata + número em mono verde, título grande. */
function SectionHead({ index, id, children }: { index: string; id?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-2">
      <span className="inline-flex items-center gap-2 font-mono text-[13px] text-primary"><PixelPaw />{index}</span>
      <h2 id={id} className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[44px]">{children}</h2>
    </div>
  );
}

export function DonationInfoSection({
  donations,
  ongs,
  filter,
  loadState,
  onFilterChange,
  onViewOng,
  onRetry,
}: DonationInfoSectionProps) {
  const summary = useMemo(() => {
    let totalCents = 0;
    const cityIds = new Set<number>();
    const ongStats = new Map<number, { count: number; cities: Set<number> }>();
    for (const donation of donations) {
      totalCents += Math.round(donation.value * 100);
      cityIds.add(donation.cityId);
      for (const ongId of new Set(donation.ongIds)) {
        const stats = ongStats.get(ongId) ?? { count: 0, cities: new Set<number>() };
        stats.count += 1;
        stats.cities.add(donation.cityId);
        ongStats.set(ongId, stats);
      }
    }
    return { totalRaised: totalCents / 100, cityCount: cityIds.size, ongStats };
  }, [donations]);
  const shownOngs = useMemo(() => [...ongs].sort((a, b) =>
    Number(b.id === filter.ongId) - Number(a.id === filter.ongId)
    || (summary.ongStats.get(b.id)?.count ?? 0) - (summary.ongStats.get(a.id)?.count ?? 0)
    || a.name.localeCompare(b.name, "pt-BR"),
  ).slice(0, ONG_LIMIT), [ongs, summary, filter.ongId]);
  const hasFilter = Object.values(filter).some((value) => value !== undefined);

  return (
    <section id="donation-info" aria-labelledby="donation-info-title" className="min-h-screen w-full bg-background pattern-paws text-foreground">
      <div className="mx-auto w-full max-w-[1240px] px-6 pt-6 pb-24 sm:px-10 sm:pt-8 sm:pb-[120px]">
        <PublicPageNav />
        <header className="mt-8 grid items-center gap-10 sm:mt-12 lg:gap-16 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="flex items-center gap-3 font-mono text-[13px] tracking-[0.06em] text-primary">
              <img src="/logo.webp" alt="Cidoe" width={48} height={48} loading="lazy" className="size-12" />
              O projeto
            </p>
            <h1 id="donation-info-title" className="mt-6 sm:mt-8 max-w-[14ch] text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.025em] text-balance sm:text-6xl lg:text-7xl">
              Cidoe: uma cidade 3D pela proteção animal.
            </h1>
            <p className="mt-6 sm:mt-8 max-w-[46ch] text-lg leading-normal text-pretty text-muted-foreground sm:text-[22px]">
              Cidoe transforma contribuições em edifícios e apoia ONGs de proteção animal:
              resgate, castração, tratamento veterinário e adoção responsável.
            </p>
          </div>
          <div className="relative">
            <PixelDog className="absolute -top-[47px] right-8 z-10" />
            <Photo
              ratio="1/1"
              src="/cat_dog.jpeg"
              webp="/cat_dog.webp"
              alt="Um cachorro e um gato lado a lado"
              width={1024}
              height={947}
              loading="lazy"
            />
          </div>
        </header>

        {loadState.status === "loading" ? (
          <div role="status" className="mt-20 sm:mt-32 flex items-center gap-3 text-muted-foreground">
            <BlockLoader /><span>Carregando ONGs e contribuições…</span>
          </div>
        ) : loadState.status === "error" ? (
          <div className="mt-20 sm:mt-32 space-y-4">
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <ErrorMark />Não foi possível carregar as contribuições.
            </p>
            <Button variant="outline" onClick={onRetry}>Tentar novamente</Button>
          </div>
        ) : (
          <>
            <div className="mt-20 sm:mt-32">
              <SectionHead index="01">Impacto</SectionHead>
              <div className="mt-9 grid gap-5 sm:grid-cols-3">
                <div className="pixel bevel-edge bg-card px-6 pt-5 pb-7 sm:col-span-3">
                  <p className="mono-label text-muted-foreground">{hasFilter ? "Total neste recorte" : "Total arrecadado"}</p>
                  <p className="mt-2 break-words text-[2.5rem] leading-tight font-semibold tracking-[-0.02em] text-primary sm:text-5xl">
                    {formatBRL(summary.totalRaised)}
                  </p>
                </div>
                {([
                  ["Edifícios", donations.length, PixelBuilding],
                  ["ONGs apoiadas", summary.ongStats.size, PixelPaw],
                  ["Cidades", summary.cityCount, MapPinIcon],
                ] as const).map(([label, count, Icon]) => (
                  <div key={label} className="pixel bevel-edge flex items-center gap-4 bg-card px-5 pt-4 pb-5">
                    <Icon className="size-4 text-primary" />
                    <div>
                      <p className="text-2xl font-semibold">{count.toLocaleString("pt-BR")}</p>
                      <p className="mono-label text-muted-foreground">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-20 sm:mt-28">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <SectionHead index="02">Para onde vai a sua contribuição</SectionHead>
                {hasFilter && <Button variant="ghost" onClick={() => onFilterChange({})}>Limpar filtros</Button>}
              </div>
              {hasFilter && <p className="mt-4 text-sm text-muted-foreground">Valores e edifícios seguem os filtros da cidade.</p>}

              {shownOngs.length === 0 ? (
                <p className="mt-9 text-muted-foreground">Nenhuma ONG disponível.</p>
              ) : (
                <ul className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {shownOngs.map((ong) => {
                    const stats = summary.ongStats.get(ong.id);
                    const count = stats?.count ?? 0;
                    const cityCount = stats?.cities.size ?? 0;
                    const active = filter.ongId === ong.id;
                    return (
                      <li
                        key={ong.id}
                        className={cn("pixel bevel-edge flex flex-col gap-3.5 px-5 pt-5 pb-6", active ? "pixel-ink-verde bg-secondary" : "bg-card")}
                      >
                        <div className="flex flex-wrap items-center gap-2.5">
                          {active && <Badge>No filtro</Badge>}
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {cityCount.toLocaleString("pt-BR")} {cityCount === 1 ? "cidade" : "cidades"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Avatar size="lg">
                            {ong.profile_image && <AvatarImage src={ong.profile_image} alt="" loading="lazy" className="object-cover" />}
                            <AvatarFallback>{ong.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <h3 className="min-w-0 break-words text-[26px] font-semibold leading-[1.15]">{ong.name}</h3>
                        </div>
                        <p className="mt-auto text-[15px]">
                          <strong>{count.toLocaleString("pt-BR")}</strong> {count === 1 ? "edifício" : "edifícios"}
                        </p>
                        <Button
                          aria-label={"Ver edifícios de " + ong.name + " na cidade"}
                          onClick={() => onViewOng(ong.id)}
                        >Ver na cidade<PixelArrow /></Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
                {ongs.length > ONG_LIMIT && <>{shownOngs.length} de {ongs.length.toLocaleString("pt-BR")} ONGs. </>}
                {donations.length === 0 ? "Nenhum edifício encontrado neste recorte." : "Um edifício pode apoiar mais de uma ONG."}
              </p>
            </div>
          </>
        )}

        <footer className="mt-20 sm:mt-[120px] flex flex-wrap items-baseline justify-between gap-6">
          <p className="max-w-[24ch] text-[28px] font-semibold leading-[1.2]">Uma cidade feita de cuidado, um edifício de cada vez.</p>
          <nav aria-label="Informações do Cidoe" className="flex flex-wrap items-baseline gap-x-5 gap-y-2 font-mono text-xs text-muted-foreground">
            <a href={ABOUT_PATH} className="underline decoration-2 underline-offset-3 hover:bg-accent hover:text-primary">Sobre o Cidoe</a>
            <a href={TERMS_PATH} className="underline decoration-2 underline-offset-3 hover:bg-accent hover:text-primary">Termos de Uso</a>
            <a href={PRIVACY_PATH} className="underline decoration-2 underline-offset-3 hover:bg-accent hover:text-primary">Política de Privacidade</a>
            <span>Cidoe · Proteção animal</span>
          </nav>
        </footer>
      </div>
    </section>
  );
}
