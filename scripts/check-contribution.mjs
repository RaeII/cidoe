// node scripts/check-contribution.mjs — campo monetário, sem servidor ou navegador.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { formatMoneyInput, normalizeMoneyInput } = await load("../src/lib/moneyInput.ts");
const { parseMoney } = await load("../src/lib/unlock.ts");
for (const [input, expected] of [
  ["", "0,00"], ["25", "25,00"], ["25,", "25,00"], ["25.", "25,00"],
  ["25,90", "25,90"], ["25.90", "25,90"], [",50", "0,50"],
  ["1.000", "1.000,00"], ["1.234,56", "1.234,56"],
  [" R$\u00a01.234,56 ", "1.234,56"], ["1.234.567,89", "1.234.567,89"],
]) assert.equal(normalizeMoneyInput(input), expected, input);

// Cada tecla mantém a vírgula e exatamente duas casas, sem esperar pelo blur.
let amount = "0,00";
for (const [digit, expected] of [["1", "0,01"], ["2", "0,12"], ["3", "1,23"], ["4", "12,34"], ["5", "123,45"], ["6", "1.234,56"]]) {
  amount = formatMoneyInput(amount + digit);
  assert.equal(amount, expected);
  assert.match(amount, /^\d{1,3}(?:\.\d{3})*,\d{2}$/);
}
for (const expected of ["123,45", "12,34", "1,23", "0,12", "0,01", "0,00", "0,00"]) {
  amount = formatMoneyInput(amount.slice(0, -1));
  assert.equal(amount, expected, "Backspace deve preservar a máscara");
}
assert.equal(formatMoneyInput(""), "0,00", "Apagar tudo mantém a vírgula");
assert.equal(formatMoneyInput("12,34"), "12,34", "Reformatar preserva valor");
for (const input of ["abc", "-25", "+25", "1e3", "0x10", "Infinity", "9007199254740992"]) {
  assert.equal(formatMoneyInput(input), null, `Máscara: entrada inválida ${input}`);
}

for (const input of ["abc", "-25", "+25", "1e3", "0x10", "Infinity", "25,999", "25.9999", "1,2,3", "12.34,56", "12 34", "9007199254740992"]) {
  assert.equal(normalizeMoneyInput(input), null, `Entrada inválida: ${input}`);
}

// O valor enviado ao pagamento deve preservar os centavos, inclusive após o blur.
for (const [input, expected] of [["25", 25], ["R$ 1.234,56", 1234.56], ["25.90", 25.9], [",50", 0.5], ["1000000,01", 1000000.01]]) {
  const normalized = normalizeMoneyInput(input);
  assert.equal(parseMoney(normalized), expected);
  const formatted = expected.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.equal(parseMoney(normalizeMoneyInput(formatted)), expected, `Formatação alterou ${input}`);
}
assert.equal(parseMoney(normalizeMoneyInput("0,00")), null);
assert.equal(parseMoney(normalizeMoneyInput("")), null);

// Executa a transição real: confirmação nunca mantém o botão preso à edição.
const source = await readFile(new URL("../src/components/html/donate/ContributeDialog.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("ContributeDialog.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const dialog = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "ContributeDialog");
const handleOpenChange = dialog.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "handleOpenChange");
const paidFlow = { step: "done", userId: 1, contribution: { donationId: null, ongId: 2, cityId: 3, value: 25 }, donationId: 42 };
const state = {
  Error, active: paidFlow, flow: paidFlow, open: true, paid: 0, editingCharge: false, toast: null, viewedId: null,
  setFlow(value) { state.flow = value; },
  onOpenChange(value) { state.open = value; },
  setEditingCharge(value) { state.editingCharge = value; },
  onPaid() { state.paid += 1; },
  onViewBuilding(id) { state.viewedId = id; },
  useEffectEvent: (handler) => handler,
};
state.toast = { success(_message, options) { state.notification = options; } };
vm.runInNewContext(ts.transpileModule(handleOpenChange.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state);
state.handleOpenChange(false);
assert.equal(state.open, false);
assert.equal(state.flow.step, "form", "Fechar confirmação libera nova contribuição");
state.active = null;
state.handleOpenChange(true);
assert.equal(state.open, true);
assert.equal(state.flow.step, "form", "Contribuir reabre formulário, não edição");
const pending = { step: "pay", userId: 1, contribution: paidFlow.contribution, city: { id: 3, name: "Cidade", uf: "SP" } };
state.active = pending;
state.flow = pending;
state.handleOpenChange(false);
assert.equal(state.flow, pending, "Fechar mantém a simulação apenas em memória");
const confirm = dialog.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "confirmSimulation");
Object.assign(state, {
  creating: false, user: { id: 1 }, error: null,
  setCreating(value) { state.creating = value; },
  setError(value) { state.error = value; },
  simulateContribution(userId, contribution, city) {
    assert.equal(userId, 1);
    assert.equal(contribution, paidFlow.contribution);
    assert.equal(city.id, 3);
    return -1;
  },
});
vm.runInNewContext(ts.transpileModule(confirm.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state);
state.confirmSimulation();
assert.equal(state.paid, 1);
assert.equal(state.flow.step, "done");
assert.equal(state.flow.donationId, -1);
state.flow = pending;
state.simulateContribution = () => { throw new Error("Armazenamento cheio"); };
state.confirmSimulation();
assert.equal(state.flow, pending, "Falha local não confirma simulação");
assert.equal(state.error, "Armazenamento cheio");
assert.equal(state.creating, false);
state.user = null;
state.error = null;
state.confirmSimulation();
assert.equal(state.error, null, "Sem sessão não confirma");
assert.doesNotMatch(source, /createPixCharge|getChargeStatus|getPendingCharge|PixPayment/);
assert.doesNotMatch(source, /BuildingProfileForm|BuildingCustomizer|Voltar à edição/);
console.log("Contribuição: centavos/máscara OK; confirmação local, falha de armazenamento e sessão ausente OK.");
