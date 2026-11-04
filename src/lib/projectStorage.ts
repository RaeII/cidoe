/** Migra preferências e cidades sem descartar o valor antigo se o armazenamento falhar. */
export function readProjectStorage(storage: Storage, key: string): string | null {
  const current = storage.getItem(key);
  if (current !== null) return current;

  const legacyKey = key.replace(/^cidoe:/, "cidoa:");
  const legacy = storage.getItem(legacyKey);
  if (legacy !== null) {
    try {
      storage.setItem(key, legacy);
      storage.removeItem(legacyKey);
    } catch {
      // Quota cheia: lê o original e tenta migrar novamente na próxima leitura.
    }
  }
  return legacy;
}
