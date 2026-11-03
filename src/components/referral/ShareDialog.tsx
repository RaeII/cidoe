import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PixelCheck } from "@/components/ui/pixel-icon";
import { LinkedInIcon } from "@/components/ui/social-icons";
import { toast } from "@/components/ui/toast";

// lucide 1.x não tem ícones de marca; glifos de simple-icons (CC0) e Feather (MIT, Facebook).
// Cor de fundo = cor da marca (dado, não estilo); X usa tinta no lugar do preto.
const networks = [
  {
    name: "WhatsApp",
    className: "bg-[#25D366]",
    href: (url: string) => `https://wa.me/?text=${url}`,
    path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  },
  {
    name: "Facebook",
    className: "bg-[#1877F2]",
    href: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    path: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
  },
  {
    name: "LinkedIn",
    className: "bg-[#0A66C2]",
    href: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    icon: <LinkedInIcon className="size-5" />,
  },
  {
    name: "X",
    className: "bg-tinta",
    href: (url: string) => `https://x.com/intent/post?url=${url}`,
    path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  },
];

/** Cópia sem Clipboard API. `host` fica dentro do modal: a trava de foco do Radix rouba o foco de fora. */
function copyWithTextarea(text: string, host: HTMLElement) {
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  host.append(area);
  area.select();
  area.setSelectionRange(0, text.length); // iOS ignora select() sozinho
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** Compartilhamento inline: redes sociais + link com botão de copiar. */
export function SharePanel({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyLink(event: React.MouseEvent<HTMLButtonElement>) {
    const host = event.currentTarget.parentElement ?? document.body;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // `navigator.clipboard` só existe em HTTPS/localhost; IP da rede local (http://192.168…) cai aqui.
      if (copyWithTextarea(url, host)) setCopied(true);
      else toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {networks.map((network) => (
          <a
            key={network.name}
            href={network.href(encodedUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-1.5 py-1 text-xs font-semibold"
          >
            <span
              className={`pixel grid size-11 place-items-center text-papel transition-transform group-hover:-translate-y-0.5 ${network.className}`}
            >
              {"icon" in network ? network.icon : <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
                <path d={network.path} />
              </svg>}
            </span>
            {network.name}
          </a>
        ))}
      </div>

      <div className="field flex items-center gap-2 p-2 pl-3">
        <input
          readOnly
          value={url}
          aria-label="Link"
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 truncate bg-transparent font-mono text-xs outline-none"
        />
        <Button type="button" size="sm" onClick={copyLink}>
          {copied ? <PixelCheck /> : <Copy />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}

/** Modal da home: mesmo painel, sem precisar abrir o menu. */
export function ShareDialog({
  open,
  onOpenChange,
  url,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-6 sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Compartilhar</DialogTitle>
        </DialogHeader>
        <SharePanel url={url} />
      </DialogContent>
    </Dialog>
  );
}
