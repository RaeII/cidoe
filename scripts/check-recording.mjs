// Fluxo real do atalho e timeline do cartão, sem servidor/navegador/GPU.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const parse = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
};
const editor = await parse("../src/components/CitySceneEditor.tsx");
const payment = await parse("../src/components/html/PaymentSimulation.tsx");
const find = (root, predicate) => {
  let found;
  const visit = (node) => { if (predicate(node)) found = node; ts.forEachChild(node, visit); };
  visit(root);
  assert(found, "trecho do fluxo de gravação ausente");
  return found;
};
const evaluate = (node, ast, context) => vm.runInNewContext(ts.transpileModule(
  `(${node.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText, context);
const start = find(editor, (node) => ts.isVariableDeclaration(node) && node.name.getText(editor) === "startPayment").initializer;
const state = {
  booted: true, donationsApplied: true, inInfo: false, myBuildingsOpen: false, contributeOpen: false,
  paymentBusyRef: { current: false }, paymentIdRef: { current: 0 }, maxDonationRef: { current: 600 },
  setPayment(value) { state.payment = value; },
};
const startPayment = evaluate(start, editor, state);
for (const [key, blockedValue] of [["booted", false], ["donationsApplied", false], ["inInfo", true], ["myBuildingsOpen", true], ["contributeOpen", true]]) {
  state[key] = blockedValue;
  startPayment();
  assert.equal(state.payment, undefined, `atalho deve aguardar ${key}`);
  state[key] = !blockedValue;
}
startPayment();
assert.ok(state.payment.amount >= 610 && state.payment.amount <= 640, "doação deve superar a maior torre da beta");
const first = state.payment;
startPayment();
assert.equal(state.payment, first, "tecla repetida não deve empilhar cartões");
const overlay = find(editor, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(editor) === "PaymentSimulation");
const confirmed = overlay.attributes.properties.find((attribute) => attribute.name?.text === "onConfirmed").initializer.expression;
const added = [];
evaluate(confirmed, editor, { canvasRef: { current: { addDonation: (amount) => added.push(amount) } }, maxDonationRef: state.maxDonationRef })(first.amount);
assert.deepEqual(added, [first.amount]);
assert.equal(state.maxDonationRef.current, first.amount);
state.paymentBusyRef.current = false;
startPayment();
assert.ok(state.payment.amount > first.amount, "próxima simulação deve superar a anterior");

const timeline = find(payment, (node) => ts.isCallExpression(node) && node.expression.getText(payment) === "useEffect"
  && node.arguments[0].getText(payment).includes("const toConfirm"));
const timers = new Map();
const phases = [], events = [];
let stopped = false;
const context = {
  amount: 630, typedChars: {}, fullValue: "R$ 630",
  TYPING_MS: 1500, QR_MS: 1800, LOADING_MS: 1800, CONFIRMED_HOLD_MS: 1500,
  animate: () => ({ stop() { stopped = true; } }),
  setTimeout(callback, delay) { timers.set(delay, callback); return delay; },
  clearTimeout: (id) => timers.delete(id), setPhase: (phase) => phases.push(phase),
  onConfirmedRef: { current: (amount) => events.push(amount) }, onDoneRef: { current: () => events.push("done") },
};
const cleanup = evaluate(timeline.arguments[0], payment, context)();
assert.equal(events.length, 0, "montar cartão não deve criar edifício antes da confirmação");
for (const delay of [1500, 3300]) timers.get(delay)();
assert.equal(events.length, 0, "digitação e QR não devem criar edifício");
timers.get(5100)();
assert.deepEqual(events, [630]);
timers.get(6600)();
assert.deepEqual(events, [630, "done"]);
assert.deepEqual(phases, ["qr", "loading", "confirmed"]);
cleanup();
assert(stopped);
assert.equal(timers.size, 0, "desmontar deve cancelar todos os timers");
console.log("ok gravação — bloqueios, valor acima da beta, cartão único, confirmação, sequência e cleanup");
