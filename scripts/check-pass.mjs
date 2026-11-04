// node scripts/check-pass.mjs — sem servidor, navegador ou dependências novas.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/pass.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { sortPassRewards } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const reward = (key, donationMin, referralMin) => ({
  key, label: key, categoryKey: "shape", categoryLabel: "Formato",
  unlock: donationMin === null && referralMin === null ? null : { donationMin, referralMin },
});
const input = [
  reward("maior-doacao", 100, null), reward("com-indicacao", 10, 3),
  reward("so-indicacoes", null, 2), reward("gratis", null, null),
  reward("menos-indicacoes", 10, 1), reward("menor-doacao", 10, null),
  reward("empate", 10, null), reward("centavos", 10.5, null),
];
const original = structuredClone(input);
assert.deepEqual(sortPassRewards(input).map((item) => item.key), [
  "gratis", "menor-doacao", "empate", "centavos", "menos-indicacoes",
  "so-indicacoes", "com-indicacao", "maior-doacao",
]);
assert.deepEqual(input, original, "Ordenação não pode alterar dados recebidos por props");
assert.equal(sortPassRewards(input).length, input.length, "Requisitos iguais mantêm cartões individuais");
assert.deepEqual(sortPassRewards([]), []);
console.log("Passe: grátis, doações, indicações, centavos, empates e dados imutáveis OK.");

const unlockSource = await readFile(new URL("../src/lib/unlock.ts", import.meta.url), "utf8");
const unlockJs = ts.transpileModule(unlockSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { meetsUnlock, canUseCustomization, formatUnlockRequirement, formatUnlockCta, formatUnlockRemaining } =
  await import(`data:text/javascript;base64,${Buffer.from(unlockJs).toString("base64")}`);
const any = { donationMin: 50, referralMin: 3, mode: "any" };
const all = { ...any, mode: "all" };
for (const [donated, referrals, either, both] of [
  [0, 0, false, false], [49.99, 2, false, false],
  [50, 0, true, false], [0, 3, true, false], [50, 3, true, true],
]) {
  const progress = { donated, referrals };
  assert.equal(meetsUnlock(any, progress), either);
  assert.equal(meetsUnlock(all, progress), both);
  assert.equal(meetsUnlock({ donationMin: 50, referralMin: 3 }, progress), both);
  if (either) assert.equal(formatUnlockRemaining(any, progress), null);
}
for (const mode of ["all", "any"]) {
  assert.equal(meetsUnlock({ donationMin: 50, referralMin: null, mode }, { donated: 0, referrals: 100 }), false);
  assert.equal(meetsUnlock({ donationMin: null, referralMin: 3, mode }, { donated: 100, referrals: 0 }), false);
}
assert.equal(meetsUnlock(null, { donated: 0, referrals: 0 }), true);
assert.equal(canUseCustomization(any, null, false), false);
assert.equal(canUseCustomization(all, { donated: 0, referrals: 0 }, true), true);
const normalize = (text) => text.replace(/\s/g, " ");
assert.equal(normalize(formatUnlockRequirement(any)), "R$ 50 ou 3 indicações");
assert.equal(normalize(formatUnlockCta(any)), "Doe R$ 50 ou faça 3 indicações para liberar");
assert.equal(normalize(formatUnlockRemaining(any, { donated: 30, referrals: 2 })), "Faltam R$ 20 ou 1 indicação");
assert.equal(normalize(formatUnlockRequirement(all)), "R$ 50 + 3 indicações");
assert.equal(normalize(formatUnlockCta(all)), "Doe R$ 50 e faça 3 indicações para liberar");
console.log("Liberação: AND, OR, legado, eixos nulos, limites, permanência e textos OK.");

const modes = [
  { ...reward("combo", 40, 2), unlock: { donationMin: 40, referralMin: 2, mode: "all" } },
  reward("indicacao-dificil", null, 20),
  reward("doacao-facil", 5, null),
  { ...reward("alternativa", 100, 1), unlock: { donationMin: 100, referralMin: 1, mode: "any" } },
  reward("equivalente", 20, null),
];
assert.deepEqual(sortPassRewards(modes).map(item => item.key), [
  "doacao-facil", "alternativa", "equivalente", "combo", "indicacao-dificil",
]);
console.log("Dificuldade: indicação ponderada, AND cumulativo, OR pela alternativa e empates estáveis OK.");
