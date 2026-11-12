import { useEffect, useEffectEvent, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, Clock, Copy, MapPin, Search } from "lucide-react";
import { RadioGroup } from "radix-ui";
import {
  createPixCharge,
  getChargeStatus,
  getPendingCharge,
  type ChargeStatus,
  type Contribution,
  type PixCharge,
} from "@/api/contributionApi";
import type { Ong } from "@/api/donationApi";
import { ApiError } from "@/api/http";
import type { City } from "@/api/location/location.types";
import type { MyDonation } from "@/components/GameMenu";
import { CityCombobox } from "@/components/ProfileDetailsFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogKicker,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BlockLoader, ErrorMark, PixelBuilding, PixelCheck, PixelChevronDown, PixelHeart } from "@/components/ui/pixel-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { formatCity, normalizeSearch } from "@/lib/citySearch";
import { formatMoneyInput, normalizeMoneyInput } from "@/lib/moneyInput";
import { formatBRL, parseMoney } from "@/lib/unlock";
import { cn } from "@/lib/utils";

const PRESETS = [10, 25, 50, 100];
// Padrão baixo aumenta a taxa de conclusão (Goswami & Urminsky, 2016).
const DEFAULT_AMOUNT = "25,00";
// Só UI: o backend tem a palavra final (400 com `message` aparece na tela).
const MIN_VALUE = 5;
const MAX_BUILDINGS = 3;
const POLL_MS = 3_000;
const STEPS = ["Contribuição", "Pagamento", "Confirmação"];
const STEP_INDEX = { form: 0, pay: 1, done: 2 } as const;

const labelClass = "mb-2 block mono-label text-foreground";
// Valor rápido (DS): papel com bisel; ativo = bloco verde.
const chipClass =
  "min-h-11 pixel pixel-thin bevel-edge bg-card px-2 pb-1 text-sm font-semibold transition-colors data-[state=unchecked]:hover:bg-accent data-[state=checked]:bevel-verde-700 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground";
// Opção em card (DS): selecionada = verde-100 + moldura verde.
const radioCardClass =
  "flex min-h-14 items-center gap-3 pixel pixel-thin bg-card px-4 text-left text-sm font-semibold transition-colors data-[state=unchecked]:enabled:hover:bg-accent data-[state=checked]:pixel-ink-verde data-[state=checked]:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";
const selectClass = "w-full data-[size=default]:h-11";
/** Erro do DS: "!" + frase em âmbar escuro, sem vermelho. */
/** Radio do DS: quadrado com quadrado interno verde quando marcado. */
const radioMark = (
  <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center pixel pixel-thin bg-card">
    <RadioGroup.Indicator className="size-2 bg-primary" />
  </span>
);
const scrollClass = "px-5 py-5 sm:px-8 sm:py-6 lg:px-10";
const footerClass = "shrink-0 border-t bg-background px-5 py-4 sm:px-8 lg:px-10";

/** Estado do fluxo. Vive fora do `DialogContent`: fechar o modal não perde o Pix. */
type Flow =
  | { step: "form" }
  | { step: "pay"; userId: number; charge: PixCharge; expired: boolean }
  | { step: "done"; userId: number; contribution: Contribution; donationId: number };

function Stepper({ current }: { current: number }) {
  const compact = current === STEP_INDEX.done;
  return (
    <ol aria-label="Etapas da contribuição" className={cn("grid grid-cols-3 gap-3 border-b pb-6 sm:gap-6", compact && "gap-2 pb-3 sm:gap-4")}>
      {STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={cn("flex flex-col items-start gap-2 text-[11px] sm:flex-row sm:items-center sm:text-sm", compact && "gap-1 sm:gap-2 sm:text-xs", index === current ? "font-semibold text-foreground" : "text-muted-foreground")}
        >
          <span aria-hidden="true" className={cn("grid size-7 shrink-0 place-items-center font-mono text-xs sm:size-8", compact && "size-5 text-[11px] sm:size-6", index <= current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {index < current ? <PixelCheck className={compact ? "size-2.5" : "size-3"} /> : index + 1}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Mesmo padrão ARIA da busca de cidade; seleção sempre aponta para uma ONG do catálogo. */
function OngCombobox({ id, ongs, value, onChange }: {
  id: string;
  ongs: readonly Ong[];
  value: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = ongs.find((ong) => String(ong.id) === value);
  const normalizedQuery = normalizeSearch(query ?? "");
  const results = ongs.filter((ong) => normalizeSearch(ong.name).includes(normalizedQuery));
  const expanded = open && results.length > 0;
  const activeIndex = Math.min(active, results.length - 1);

  useEffect(() => {
    if (!open) return;
    const closeList = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.target !== inputRef.current) return;
      event.preventDefault();
      setOpen(false);
      setQuery(null);
    };
    window.addEventListener("keydown", closeList, true);
    return () => window.removeEventListener("keydown", closeList, true);
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    const option = list?.children[activeIndex] as HTMLElement | undefined;
    if (!expanded || !list || !option) return;
    // Rola só as sugestões; mover os ancestrais pode esconder o input acima da lista.
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }, [expanded, activeIndex, normalizedQuery]);

  function pick(ong: Ong) {
    onChange(String(ong.id));
    setQuery(null);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
      event.preventDefault();
      setOpen(true);
      if (expanded) setActive((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (expanded) pick(results[activeIndex]);
    }
  }

  return (
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-required="true"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={!ongs.length}
        placeholder={ongs.length ? "Busque ou escolha uma ONG" : "Nenhuma ONG disponível"}
        className="pl-10 pr-10"
        value={query ?? selected?.name ?? ""}
        onFocus={(event) => {
          event.target.select();
          setActive(Math.max(0, ongs.findIndex((ong) => String(ong.id) === value)));
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => {
          if (query?.trim()) {
            const exact = results.filter((ong) => normalizeSearch(ong.name) === normalizeSearch(query));
            const match = results.length === 1 ? results[0] : exact.length === 1 ? exact[0] : null;
            if (match) onChange(String(match.id));
          }
          setQuery(null);
          setOpen(false);
        }}
        onKeyDown={handleKeyDown}
      />
      <PixelChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-foreground" />
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="ONGs"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-20 mt-2 max-h-[min(15rem,calc(var(--viewport-height,100dvh)-6rem))] overflow-y-auto pixel bg-popover p-1 text-popover-foreground"
      >
        {results.map((ong, index) => (
          <li
            key={ong.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            className="menu-cursor flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2.5 pr-3 pl-6 text-sm aria-selected:bg-accent"
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setActive(index)}
            onClick={() => pick(ong)}
          >
            <span className="min-w-0 break-words">{ong.name}</span>
            {String(ong.id) === value && <PixelCheck className="size-3 text-primary" />}
          </li>
        ))}
      </ul>
      {open && !results.length && (
        <p role="status" className="absolute inset-x-0 top-full z-20 mt-2 pixel bg-popover px-4 py-3 text-sm text-muted-foreground">
          Nenhuma ONG encontrada.
        </p>
      )}
    </div>
  );
}

/** Etapa 2: Copia e Cola é a ação primária no celular; QR em destaque no desktop. */
function PixPayment({
  charge,
  ongName,
  place,
  expired,
  offline,
  creating,
  error,
  onRenew,
  onBack,
  onClose,
}: {
  charge: PixCharge;
  ongName?: string;
  place?: string;
  expired: boolean;
  offline: boolean;
  creating: boolean;
  error: string | null;
  onRenew: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const codeId = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(charge.copyPaste);
      setCopyFailed(false);
      setCopied(true);
    } catch {
      // Clipboard só existe em contexto seguro: sobra selecionar à mão.
      codeRef.current?.select();
      setCopyFailed(true);
    }
  }

  const qr = <img src={charge.qrCodeImage} alt="QR code do Pix" className="mx-auto size-56 max-w-full bg-card p-3" />;
  const validUntil = new Date(charge.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={scrollClass}>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-8">
          <div className="flex flex-col items-center justify-center gap-5 pixel pixel-thin bg-card p-5 text-center sm:p-6">
            <div className="space-y-2">
              <p className="mono-label text-muted-foreground">Sua contribuição</p>
              <p className="break-words text-4xl font-semibold tracking-[-0.02em] tabular-nums">{formatBRL(charge.contribution.value)}</p>
              {ongName && <p className="break-words text-sm font-medium">{ongName}</p>}
              {place && <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{place}</p>}
            </div>
            {!expired && (isMobile ? (
              <div className="space-y-3">
                <Button type="button" variant="outline" aria-expanded={showQr} onClick={() => setShowQr((show) => !show)}>
                  {showQr ? "Esconder QR code" : "Mostrar QR code"}
                </Button>
                {showQr && qr}
              </div>
            ) : qr)}
            {!expired && <p className="mono-label flex items-center gap-1.5 text-muted-foreground"><Clock aria-hidden="true" className="size-3.5" />Válido até {validUntil}</p>}
          </div>

          <div className="min-w-0 space-y-5">
            {expired ? (
              <div className="space-y-4 pixel pixel-thin pixel-ink-ambar-700 bg-ambar-100 p-5 text-tinta">
                <Clock aria-hidden="true" className="size-7 text-destructive" />
                <h3 className="font-semibold">Este código expirou</h3>
                <p className="text-sm text-muted-foreground">Gere outro Pix para continuar com a mesma contribuição.</p>
                {error && (
                  <p role="alert" className="flex gap-1.5 text-sm text-destructive">
                    <ErrorMark />
                    {error}
                  </p>
                )}
                <Button size="lg" className="w-full" disabled={creating} onClick={onRenew}>
                  {creating ? (
                    <>
                      <BlockLoader />
                      Gerando Pix…
                    </>
                  ) : (
                    "Gerar novo código"
                  )}
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor={codeId} className={labelClass}>
                    Pix Copia e Cola
                  </label>
                  <Input
                    ref={codeRef}
                    id={codeId}
                    readOnly
                    value={charge.copyPaste}
                    className="font-mono text-xs md:text-xs"
                    onFocus={(event) => event.target.select()}
                  />
                  {copyFailed && <p className="mt-2 text-sm text-muted-foreground">Selecione o código e copie.</p>}
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={copyCode}
                >
                  {copied ? <PixelCheck /> : <Copy />}
                  {copied ? "Código copiado" : "Copiar código Pix"}
                </Button>
                <span role="status" className="sr-only">
                  {copied ? "Código copiado." : ""}
                </span>
                <ol className="space-y-4 text-sm">
                  {["Abra o app do seu banco e entre em Pix.", isMobile ? "Escolha Pix Copia e Cola e cole o código." : "Leia o QR code ou cole o código copiado.", "Confira o valor e o recebedor antes de confirmar."].map((instruction, index) => (
                    <li key={instruction} className="flex items-start gap-3">
                      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center bg-secondary font-mono text-xs text-secondary-foreground">{index + 1}</span>
                      <span className="pt-0.5 text-muted-foreground">{instruction}</span>
                    </li>
                  ))}
                </ol>
                <div className="bg-card px-4 py-3 text-sm">
                  <p className="mono-label text-muted-foreground">Recebedor no app do banco</p>
                  <p className="mt-1 break-words font-semibold">{charge.receiverName}</p>
                </div>
                <p role="status" className={cn("flex items-center gap-2 px-4 py-3 text-sm", offline ? "bg-ambar-100 text-tinta" : "bg-secondary text-secondary-foreground")}>
                  {offline ? <ErrorMark /> : <BlockLoader className="text-primary" />}
                  {offline ? "Sem conexão. Tentando novamente…" : "Aguardando confirmação do pagamento"}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
      <div className={cn(footerClass, "flex flex-wrap justify-between gap-2")}>
        <Button type="button" variant="ghost" className="h-11" disabled={creating} onClick={onBack}>
          Alterar contribuição
        </Button>
        <Button type="button" variant="outline" className="h-11" disabled={creating} onClick={onClose}>
          Continuar depois
        </Button>
      </div>
    </div>
  );
}

/**
 * Contribuição → Pix → confirmação. Administração do edifício fica na cidade.
 */
export function ContributeDialog({
  open,
  showTrigger = true,
  onOpenChange,
  ongs,
  buildings,
  onRequestLogin,
  onPaid,
  onViewBuilding,
}: {
  open: boolean;
  showTrigger?: boolean;
  onOpenChange: (open: boolean) => void;
  ongs: readonly Ong[];
  /** Edifícios do usuário; sem nenhum, a escolha novo/aumentar some. */
  buildings: readonly MyDonation[];
  onRequestLogin: () => void;
  /** Pagamento confirmado pelo servidor: o edifício entra ou cresce na cidade. */
  onPaid: (contribution: Contribution, donationId: number) => void;
  onViewBuilding: (donationId: number) => void;
}) {
  const { user, isLoading } = useAuth();
  const userId = user?.id;
  const ongFieldId = useId();
  const cityFieldId = useId();
  const amountId = useId();
  const amountErrorId = useId();
  const amountHintId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const [grow, setGrow] = useState(false);
  const [buildingId, setBuildingId] = useState("");
  const [ongId, setOngId] = useState("");
  /** undefined = campo não tocado: mostra a cidade do perfil. */
  const [city, setCity] = useState<City | null | undefined>(undefined);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [amountBlurred, setAmountBlurred] = useState(false);
  const [flow, setFlow] = useState<Flow>({ step: "form" });
  const [editingCharge, setEditingCharge] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  // Cobrança de outra sessão (logout/troca de conta) nunca é reaproveitada.
  const active = flow.step === "form" || flow.userId !== userId ? null : flow;
  const step = active?.step === "pay" && editingCharge ? "form" : active?.step ?? "form";
  const pendingChargeId = active?.step === "pay" && !active.expired ? active.charge.id : null;

  const ongNameOf = (contribution: Contribution) =>
    ongs.find((ong) => ong.id === contribution.ongId)?.name;

  const handleStatus = useEffectEvent((chargeId: string, result: ChargeStatus) => {
    if (active?.step !== "pay" || active.charge.id !== chargeId) return;
    if (result.status === "expired") setFlow({ ...active, expired: true });
    if (result.status !== "paid") return;
    const { contribution } = active.charge;
    onPaid(contribution, result.donationId);
    setEditingCharge(false);
    setFlow(open
      ? { step: "done", userId: active.userId, contribution, donationId: result.donationId }
      : { step: "form" });
    if (!open) {
      toast.success("Pagamento confirmado.", {
        description: contribution.donationId === null ? "Seu edifício já está na cidade." : "Seu edifício cresceu.",
        duration: 10_000,
        action: { label: "Ver edifício", onClick: () => onViewBuilding(result.donationId) },
      });
    }
  });

  // Status ao vivo, com o modal aberto ou fechado. Aba escondida não consulta;
  // voltar do app do banco (visibilitychange) consulta na hora.
  useEffect(() => {
    if (!pendingChargeId) return;
    const chargeId = pendingChargeId;
    const controller = new AbortController();
    let failures = 0;
    let busy = false;
    async function check() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const result = await getChargeStatus(chargeId, controller.signal);
        failures = 0;
        if (!controller.signal.aborted) handleStatus(chargeId, result);
      } catch {
        failures += 1;
      } finally {
        busy = false;
      }
      if (!controller.signal.aborted) setOffline(failures >= 3);
    }
    const timer = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [pendingChargeId]);

  // Retoma o Pix pendente da conta (remount após retry; com o backend, recarregar a página).
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    getPendingCharge(controller.signal).then(
      (charge) => {
        if (!charge || controller.signal.aborted) return;
        setFlow((current) =>
          current.step !== "form" && current.userId === userId
            ? current
            : { step: "pay", userId, charge, expired: false },
        );
      },
      () => {},
    );
    return () => controller.abort();
  }, [userId]);

  // Troca de etapa leva o foco ao título; a 1ª abertura fica com o autofocus do Radix.
  const lastStep = useRef(step);
  useEffect(() => {
    if (lastStep.current === step) return;
    lastStep.current = step;
    if (open) titleRef.current?.focus();
  }, [step, open]);

  const value = parseMoney(amount);
  const atBuildingLimit = buildings.length >= MAX_BUILDINGS;
  const growing = (grow || atBuildingLimit) && buildings.length > 0;
  const pickedBuilding = buildingId || (buildings.length === 1 ? String(buildings[0].id) : "");
  const pickedOng = ongId || (ongs.length === 1 ? String(ongs[0].id) : "");
  const pickedCity = city === undefined ? (user?.city ?? null) : city;
  const selectedBuilding = buildings.find((building) => String(building.id) === pickedBuilding);
  const selectedOng = ongs.find((ong) => String(ong.id) === pickedOng);
  const destinationName = selectedOng?.name;
  const destinationPlace = growing ? selectedBuilding?.place : pickedCity ? formatCity(pickedCity) : undefined;
  const amountError = amountBlurred && (value === null || value < MIN_VALUE)
    ? `Mínimo de ${formatBRL(MIN_VALUE)}.`
    : null;

  let contribution: Contribution | null = null;
  if (value !== null && value >= MIN_VALUE && selectedOng) {
    if (growing) {
      if (selectedBuilding) contribution = { donationId: selectedBuilding.id, ongId: selectedOng.id, value };
    } else if (pickedCity) {
      contribution = { donationId: null, ongId: selectedOng.id, cityId: pickedCity.id, value };
    }
  }

  async function startCharge(input: Contribution) {
    if (creating) return;
    if (!user) return onRequestLogin();
    setCreating(true);
    setError(null);
    try {
      const charge = await createPixCharge(input);
      setOffline(false);
      setEditingCharge(false);
      setFlow({ step: "pay", userId: user.id, charge, expired: false });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401) {
        setError("Sua sessão expirou. Entre de novo.");
        onRequestLogin();
      } else {
        setError(
          (status === 400 || status === 503) && err instanceof ApiError ? err.message : "Não foi possível gerar o Pix. Tente de novo.",
        );
      }
    } finally {
      setCreating(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!contribution) return;
    if (!user) return onRequestLogin();
    void startCharge(contribution);
  }

  function backToForm() {
    setEditingCharge(true);
    setError(null);
  }

  // Fechar a confirmação libera outra contribuição; Pix pendente continua acompanhado.
  function handleOpenChange(next: boolean) {
    if (!next && active?.step === "done") setFlow({ step: "form" });
    onOpenChange(next);
  }

  const doneGrew = active?.step === "done" && active.contribution.donationId !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          {/* Centrado sem translate: o `press` do botão usa a propriedade translate. Mobile: à esquerda, livra o chevron (right-20). */}
          <Button type="button" size="lg" className="absolute bottom-4 left-4 right-20 z-30 max-sm:text-sm max-sm:has-[>svg]:px-3 sm:inset-x-0 sm:bottom-6 sm:mx-auto sm:w-fit">
            {pendingChargeId ? <Clock aria-hidden="true" /> : <PixelBuilding />}
            Contribuir
          </Button>
        </DialogTrigger>
      )}
      {/* text-foreground: o body da cena pinta texto branco, que sumiria no tema claro. */}
      <DialogContent
        className="block max-h-[calc(var(--viewport-height,100dvh)-1rem)] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] gap-0 overflow-y-auto overscroll-contain p-0 pb-1.5 text-foreground sm:max-h-[calc(var(--viewport-height,100dvh)-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-3xl lg:max-w-4xl"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogKicker className="shrink-0">
          {STEP_INDEX[step] + 1}/{STEPS.length} · {STEPS[STEP_INDEX[step]]}
        </DialogKicker>
        <DialogHeader className={cn("shrink-0 px-5 pb-5 pt-5 text-left sm:px-8 sm:pt-6 lg:px-10 lg:pt-8", step === "done" && "gap-1 pb-3 pt-3 sm:pt-4 lg:pt-4")}>
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            className={cn("flex items-center gap-3 text-2xl leading-tight outline-none sm:text-3xl", step === "done" && "gap-2 text-xl sm:text-xl")}
          >
            <span className={cn("grid size-11 shrink-0 place-items-center", step === "done" ? "size-8 bg-primary text-primary-foreground" : "bg-secondary text-primary")}>
              {step === "done" ? <PixelCheck /> : <PixelHeart className="size-6" />}
            </span>
            {step === "form" ? "Faça sua contribuição" : step === "pay" ? "Pagamento com Pix" : "Pagamento confirmado"}
          </DialogTitle>
          <DialogDescription className={step === "done" ? "text-xs leading-5" : undefined}>
            {step === "form"
              ? "Apoie uma ONG e tenha seu edifício na cidade."
              : step === "pay"
                ? "Esta tela atualiza sozinha quando o pagamento for confirmado."
                : `Seu edifício ${
                    doneGrew ? "cresceu." : "já está na cidade."
                  }`}
          </DialogDescription>
        </DialogHeader>
        <div className="shrink-0 px-5 sm:px-8 lg:px-10">
          <Stepper current={STEP_INDEX[step]} />
        </div>

        {active?.step === "pay" && !editingCharge ? (
          <PixPayment
            key={active.charge.id}
            charge={active.charge}
            ongName={ongNameOf(active.charge.contribution)}
            place={active.charge.contribution.donationId === null
              ? pickedCity?.id === active.charge.contribution.cityId ? formatCity(pickedCity) : undefined
              : buildings.find((building) => building.id === active.charge.contribution.donationId)?.place}
            expired={active.expired}
            offline={offline}
            creating={creating}
            error={error}
            onRenew={() => void startCharge(active.charge.contribution)}
            onBack={backToForm}
            onClose={() => onOpenChange(false)}
          />
        ) : active?.step === "done" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className={scrollClass}>
              <p className="text-sm text-muted-foreground">Veja e administre seu edifício em Meus edifícios.</p>
            </div>
            <div className={cn(footerClass, "flex flex-wrap justify-end gap-2")}>
              <Button type="button" variant="outline" className="h-11" onClick={() => setFlow({ step: "form" })}>Nova contribuição</Button>
              <Button type="button" className="h-11" onClick={() => {
                handleOpenChange(false);
                onViewBuilding(active.donationId);
              }}>Ver meu edifício</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} aria-busy={creating} className="flex min-h-0 flex-1 flex-col">
            <div className={cn(scrollClass, "space-y-6")}>
              {pendingChargeId && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary px-4 py-3 text-sm">
                  <p className="flex items-center gap-2"><Clock aria-hidden="true" className="size-4 shrink-0" />Você tem um Pix pendente.</p>
                  <Button type="button" variant="outline" disabled={creating} onClick={() => {
                    setEditingCharge(false);
                    setError(null);
                  }}>Voltar ao Pix</Button>
                  <p className="w-full text-xs text-muted-foreground">Ao gerar outro Pix, o código anterior será substituído.</p>
                </div>
              )}
              <fieldset disabled={creating} className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
                <div className="min-w-0 space-y-6">
                  {buildings.length > 0 && (
                    <div>
                      <p id={`${amountId}-building`} className={labelClass}>Edifício</p>
                      <RadioGroup.Root
                        aria-labelledby={`${amountId}-building`}
                        value={growing ? "grow" : "new"}
                        onValueChange={(next) => setGrow(next === "grow")}
                        className="grid grid-cols-2 gap-3"
                      >
                        <RadioGroup.Item value="new" disabled={atBuildingLimit} className={radioCardClass}>
                          {radioMark}
                          Novo edifício
                        </RadioGroup.Item>
                        <RadioGroup.Item value="grow" className={radioCardClass}>
                          {radioMark}
                          Aumentar edifício
                        </RadioGroup.Item>
                      </RadioGroup.Root>
                      {atBuildingLimit && <p className="mt-2 text-xs text-muted-foreground">Limite de 3 edifícios por conta.</p>}
                      {growing && (
                        <Select value={pickedBuilding} onValueChange={setBuildingId}>
                          <SelectTrigger aria-label="Qual edifício" className={`mt-4 ${selectClass}`}>
                            <SelectValue placeholder="Qual edifício?" />
                          </SelectTrigger>
                          <SelectContent>
                            {buildings.map((building, index) => (
                              <SelectItem key={building.id} value={String(building.id)}>
                                Edifício {index + 1} · {formatBRL(building.value)}
                                {building.ongName && ` · ${building.ongName}`}
                                {building.place && ` · ${building.place}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                  <div>
                    <label htmlFor={ongFieldId} className={labelClass}>
                      ONG
                    </label>
                    <OngCombobox id={ongFieldId} ongs={ongs} value={pickedOng} onChange={setOngId} />
                  </div>
                  {!growing && (
                    <div>
                      <label htmlFor={cityFieldId} className={labelClass}>
                        Cidade do edifício
                      </label>
                      <CityCombobox id={cityFieldId} value={pickedCity} onChange={setCity} />
                      <p className="mt-2 text-xs text-muted-foreground">Seu edifício aparecerá nesta cidade.</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 bg-secondary p-3 text-sm text-foreground">
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center bg-primary text-primary-foreground"><PixelBuilding /></span>
                    <p>{growing ? "Sua contribuição aumenta o valor do edifício escolhido." : "Após o pagamento, administre seu edifício em Meus edifícios."}</p>
                  </div>
                </div>
                <div className="min-w-0 bg-card p-5 sm:p-6">
                  <label htmlFor={amountId} className={labelClass}>
                    Valor da contribuição
                  </label>
                  {/* Campo com prefixo (DS): grupo `field`, R$ em bloco verde-100, input sem moldura. */}
                  <div className="field mb-4 flex h-14 items-stretch">
                    <span aria-hidden="true" className="grid place-items-center bg-secondary px-4 font-mono text-secondary-foreground">
                      R$
                    </span>
                    <input
                      id={amountId}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="0,00"
                      className="min-w-0 flex-1 bg-transparent px-4 text-2xl font-semibold tracking-[-0.02em] tabular-nums outline-none placeholder:text-placeholder"
                      value={amount}
                      aria-invalid={amountError ? true : undefined}
                      aria-describedby={`${amountHintId}${amountError ? ` ${amountErrorId}` : ""}`}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => {
                        const next = formatMoneyInput(event.target.value);
                        if (next !== null) setAmount(next);
                      }}
                      onPaste={(event) => {
                        event.preventDefault();
                        const next = normalizeMoneyInput(event.clipboardData.getData("text"));
                        if (next !== null) setAmount(next);
                      }}
                      onBlur={() => setAmountBlurred(true)}
                    />
                  </div>
                  <RadioGroup.Root
                    aria-label="Valores sugeridos"
                    value={value !== null && PRESETS.includes(value) ? String(value) : ""}
                    onValueChange={(preset) => {
                      setAmount(`${preset},00`);
                      setAmountBlurred(false);
                    }}
                    className="grid grid-cols-2 gap-3 min-[380px]:grid-cols-4"
                  >
                    {PRESETS.map((preset) => (
                      <RadioGroup.Item key={preset} value={String(preset)} className={chipClass}>
                        {formatBRL(preset)}
                      </RadioGroup.Item>
                    ))}
                  </RadioGroup.Root>
                  <p id={amountHintId} className="mt-3 text-xs text-muted-foreground">Mínimo de {formatBRL(MIN_VALUE)}. Você pode digitar outro valor.</p>
                  {amountError && (
                    <p id={amountErrorId} role="alert" className="mt-2 flex gap-1.5 text-sm text-destructive">
                      <ErrorMark />
                      {amountError}
                    </p>
                  )}
                  <dl className="mt-5 space-y-3 border-t pt-5 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">ONG</dt>
                      <dd className="min-w-0 break-words text-right font-medium">{destinationName ?? "Selecione uma ONG"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Cidade</dt>
                      <dd className="min-w-0 break-words text-right font-medium">{destinationPlace ?? (growing ? selectedBuilding ? "Cidade do edifício" : "Selecione um edifício" : "Selecione uma cidade")}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Pagamento</dt>
                      <dd className="font-medium">Pix</dd>
                    </div>
                    {growing && selectedBuilding && value !== null && (
                      <div className="flex justify-between gap-4 border-t pt-3">
                        <dt className="text-muted-foreground">Edifício após a contribuição</dt>
                        <dd className="font-medium tabular-nums">{formatBRL(selectedBuilding.value + value)}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </fieldset>
            </div>
            <div className={cn(footerClass, "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between")}>
              <div className="text-sm text-muted-foreground">
                {error ? <p role="alert" className="flex gap-1.5 text-destructive"><ErrorMark />{error}</p>
                  : !contribution ? <p>{growing && !selectedBuilding ? "Escolha o edifício para continuar." : !selectedOng ? "Escolha uma ONG para continuar." : !growing && !pickedCity ? "Escolha uma cidade para continuar." : "Informe um valor a partir de R$ 5."}</p>
                  : !user ? <p>Entre para vincular o edifício à sua conta.</p>
                  : <p>Na próxima etapa, você recebe o código Pix.</p>}
              </div>
              <Button type="submit" size="lg" className="w-full px-6 sm:w-auto sm:min-w-52" disabled={!contribution || creating || isLoading}>
                {creating ? (
                  <>
                    <BlockLoader />
                    Gerando Pix…
                  </>
                ) : !user ? (
                  "Entrar para continuar"
                ) : (
                  <>
                    Ir para pagamento
                    <ArrowRight aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
