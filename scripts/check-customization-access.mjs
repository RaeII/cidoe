// node scripts/check-customization-access.mjs — sem servidor/navegador.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/unlock.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { canUseCustomization } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const paid = { donationMin: 100, referralMin: 3 };
const zero = { donated: 0, referrals: 0 };
assert.equal(canUseCustomization(paid, zero, true), true, "Combo recebido dispensa doação/indicação");
assert.equal(canUseCustomization(paid, zero, false), false, "Demais usuários precisam conquistar");
assert.equal(canUseCustomization(paid, null, false), false, "Sessão ausente/carregando/falha não libera");
assert.equal(canUseCustomization(null, null, false), true, "Grátis permanece disponível");
assert.equal(canUseCustomization(paid, { donated: 100, referrals: 2 }, false), false, "Requisitos são AND");
assert.equal(canUseCustomization(paid, { donated: 100, referrals: 3 }, false), true);
assert.equal(canUseCustomization({ donationMin: 9999, referralMin: 99 }, zero, true), true, "Conquista permanente");
assert.equal(canUseCustomization(paid, null, false, true), true, "Admin pode visualizar catálogo");
console.log("Acesso: presentes, requisitos, sessão ausente, grátis e conquistas permanentes OK.");
