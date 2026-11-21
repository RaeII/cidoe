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

/** Copia texto. `navigator.clipboard` só existe em HTTPS/localhost; IP da rede local (http://192.168…) cai no textarea. */
export async function copyText(text: string, host: HTMLElement = document.body): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyWithTextarea(text, host);
  }
}
