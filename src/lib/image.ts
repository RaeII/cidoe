const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_DIMENSION = 5_000;

function hasImageSignature(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
    (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
  );
}

/** Valida tipo, tamanho, assinatura e dimensões e decodifica. Quem chama fecha o bitmap. */
async function readImage(file: File): Promise<ImageBitmap> {
  if (!IMAGE_TYPES.has(file.type) || file.size > MAX_SOURCE_BYTES) {
    throw new Error("Selecione uma imagem JPEG, PNG ou WebP de até 10 MB");
  }

  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasImageSignature(signature)) {
    throw new Error("O arquivo selecionado não é uma imagem válida");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível ler a imagem selecionada");
  }
  if (
    bitmap.width <= 0 || bitmap.height <= 0 ||
    bitmap.width > MAX_SOURCE_DIMENSION || bitmap.height > MAX_SOURCE_DIMENSION
  ) {
    bitmap.close();
    throw new Error("A imagem deve ter no máximo 5000 px de largura e altura");
  }
  return bitmap;
}

function canvasContext(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível processar a imagem");
  return { canvas, context };
}

/** Valida, reduz proporcionalmente e normaliza uma imagem como JPEG base64. */
export async function resizeImage(file: File, maxDimension = 400): Promise<string> {
  const bitmap = await readImage(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const { canvas, context } = canvasContext(width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    bitmap.close();
  }
}

/**
 * Imagem do telão (evento dos times): recorte central quadrado — o telão estica a imagem em
 * 128×128 LEDs — em 256 px + miniatura 96 px da lista. WebP; navegador sem encoder WebP (o canvas
 * devolve PNG no lugar) manda PNG. O servidor confere assinatura e tamanho.
 */
export async function encodeClubImage(file: File): Promise<{ image: string; thumb: string }> {
  const bitmap = await readImage(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const x = (bitmap.width - side) / 2;
    const y = (bitmap.height - side) / 2;
    const encode = (size: number) => {
      const { canvas, context } = canvasContext(size, size);
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, x, y, side, side, 0, 0, size, size);
      const webp = canvas.toDataURL("image/webp", 0.9);
      return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
    };
    return { image: encode(256), thumb: encode(96) };
  } finally {
    bitmap.close();
  }
}
