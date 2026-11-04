// Google Identity Services sob demanda: o script (~100 KiB) só baixa quando o login
// abre (ou o ponteiro chega no "Entrar"), não em toda visita à cena.
let loading: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Falhou (rede, bloqueador): próxima abertura do login tenta de novo.
      script.remove();
      loading = null;
      reject(new Error("Google Identity Services indisponível"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
