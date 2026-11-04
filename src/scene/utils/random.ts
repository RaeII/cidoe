export function fract(value: number) {
  return value - Math.floor(value);
}

export function seeded(x: number, z: number, salt = 0) {
  return fract(Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453123);
}

/**
 * Índice determinístico em [0, length) a partir de um id (sorteio estável: o
 * mesmo id cai sempre no mesmo item). `length <= 0` devolve 0.
 * O clamp cobre o caso de `seeded` devolver exatamente 1.0.
 */
export function pickIndex(id: number, salt: number, length: number) {
  if (length <= 0) return 0;
  return Math.min(Math.floor(seeded(id, salt, 1) * length), length - 1);
}
