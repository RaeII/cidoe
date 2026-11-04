// Componente real com estado local; sem servidor, navegador ou chamadas à API.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import ts from "typescript";

const source = await readFile("src/components/admin/RewardExamples.tsx", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let state = null;
let loadDialog;
const RewardDialog = () => null;
const nativeRequire = createRequire(import.meta.url);
const modules = {
  react: {
    ...React,
    lazy: (load) => { loadDialog = load; return RewardDialog; },
    useState: () => [state, (value) => { state = value; }],
  },
  "react/jsx-runtime": nativeRequire("react/jsx-runtime"),
  "lucide-react": { Gift: "Gift", Trophy: "Trophy" },
  "@/components/ui/button": { Button: "Button" },
  "@/components/ui/pixel-icon": { BlockLoader: "BlockLoader" },
  "@/components/pass/RewardDialog": { default: RewardDialog },
};
const context = { exports: {}, require: (name) => {
  assert.ok(name in modules, `Exemplos não devem importar API ou sessão: ${name}`);
  return modules[name];
} };
vm.runInNewContext(js, context);
assert.equal((await loadDialog()).default, RewardDialog, "Reutiliza o modal de produção sob demanda");

function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...find(node.props.children, predicate)];
}
let props = {};
const render = () => context.exports.RewardExamples(props);
const current = () => find(render(), (node) => node.type === RewardDialog)[0]?.props.rewards;
const buttons = () => find(render(), (node) => node.type === "Button");

assert.equal(current(), undefined, "Não monta modal antes do clique");
buttons()[0].props.onClick();
let rewards = current();
assert.equal(rewards.pending[0].optionKey, "loft");
assert.equal(rewards.pending[0].unlock.donationMin, 50);
assert.ok(rewards.next.remaining);
assert.equal(rewards.choice, undefined);
rewards.dismiss(rewards.pending.map((reward) => reward.key));
assert.equal(current(), undefined, "Continuar/fechar encerra exemplo");

buttons()[1].props.onClick();
rewards = current();
assert.equal(rewards.pending.length, 0);
assert.equal(rewards.choice.referralMin, rewards.signupReferrals);
assert.equal(rewards.choice.rewards.length, 2, "Duas opções na escolha por indicação");
assert.ok(rewards.nextChoice.referralMin > rewards.signupReferrals);
rewards.deferChoice();
assert.equal(current(), undefined, "Escolher depois encerra exemplo");

for (const index of [0, 1]) {
  buttons()[1].props.onClick();
  rewards = current();
  const chosen = rewards.choice.rewards[index];
  await rewards.choose(rewards.choice.referralMin, chosen.key);
  rewards = current();
  assert.equal(rewards.choice, undefined, "Confirmar troca escolha pela conquista");
  assert.equal(rewards.pending[0].key, chosen.key);
  assert.equal(rewards.pending[0].signupReferralMin, 2, "Motivo identifica cadastros indicados");
  assert.equal(rewards.pending[0].unlock, null, "Motivo da conquista não é contribuição");
  assert.notEqual(rewards.next.reward.key, chosen.key, "Próxima conquista difere do item escolhido");
  rewards.dismiss([chosen.key]);
}
buttons()[1].props.onClick();
assert.equal(current().pending.length, 0, "Reabrir reinicia a simulação");
assert.equal(current().choice.rewards[0].unlock.donationMin, 50, "Escolha não altera dados de exemplo");

// Metas do admin = total: escolheu na 2, meta 3 falta 1 (não 3).
props = { goals: [2, 3] };
rewards = current();
assert.equal(rewards.nextChoice.referralMin - rewards.signupReferrals, 1, "Próxima meta usa o total já feito");
props = { goals: [4] };
assert.equal(current().nextChoice, undefined, "Meta única não mostra próxima");

for (const page of ["Pass", "EarlySignups"]) {
  const pageSource = await readFile(`src/pages/admin/${page}.tsx`, "utf8");
  assert.ok(pageSource.includes("<RewardExamples "), `${page} disponibiliza exemplos`);
}
console.log("Exemplos: conquista, duas escolhas, confirmação, próxima meta, fechar, reabrir e isolamento da API OK.");
