// node scripts/check-building-management.mjs — administração e foco, sem servidor/navegador.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { build } from "esbuild";
import ts from "typescript";

const dialogSource = await readFile(new URL("../src/components/html/BuildingManageDialog.tsx", import.meta.url), "utf8");
const dialogAst = ts.createSourceFile("BuildingManageDialog.tsx", dialogSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const dialog = dialogAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "BuildingManageDialog");
const tabState = dialog.body.statements.filter(ts.isVariableStatement)
  .flatMap((node) => [...node.declarationList.declarations])
  .find((node) => ts.isArrayBindingPattern(node.name) && node.name.elements[0].name.getText(dialogAst) === "buildingTab");
assert.equal(tabState.initializer.arguments[0].getText(dialogAst), "initialTab");
const initialTabProp = dialog.parameters[0].name.elements.find((element) => element.name.getText(dialogAst) === "initialTab");
assert.equal(initialTabProp.initializer.text, "information", "Administração continua abrindo em Informações por padrão");
const leave = dialog.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "leaveProfile");
const state = {
  profileEdit: { dirty: false, busy: false }, appearanceBusy: false, confirmExit: false, closed: false,
  get editBusy() { return state.profileEdit.busy || state.appearanceBusy; },
  setConfirmExit(value) { state.confirmExit = value; },
  onClose() { state.closed = true; },
};
vm.runInNewContext(ts.transpileModule(leave.getText(dialogAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state);
state.leaveProfile();
assert.equal(state.closed, true, "Sem alterações pode voltar à cidade");
state.closed = false;
state.appearanceBusy = true;
state.leaveProfile();
assert.equal(state.closed, false, "Ler holograma bloqueia saída");
state.appearanceBusy = false;
state.profileEdit = { dirty: true, busy: true };
state.leaveProfile();
assert.equal(state.closed, false, "Salvar/processar imagem bloqueia saída");
assert.equal(state.confirmExit, false);
state.profileEdit.busy = false;
state.leaveProfile();
assert.equal(state.closed, false, "Edições pendentes exigem confirmação");
assert.equal(state.confirmExit, true);

// Renderiza a seção real do edifício: informações abertas, perfil preservado na outra aba
// e envio pelo rodapé externo. A prévia 3D fica fora deste check, sem GPU/navegador.
let buildingSection;
function findSection(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(dialogAst) === "Tabs.Root") buildingSection = node;
  ts.forEachChild(node, findSection);
}
findSection(dialog);
assert.ok(buildingSection, "Informações e aparência precisam de navegação própria");
const constant = (name) => dialogAst.statements
  .filter(ts.isVariableStatement)
  .flatMap((node) => [...node.declarationList.declarations])
  .find((node) => node.name.getText(dialogAst) === name).initializer.text;
const menuSource = await readFile(new URL("../src/components/GameMenu.tsx", import.meta.url), "utf8");
const menuAst = ts.createSourceFile("GameMenu.tsx", menuSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
let donationSection;
function findDonations(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(menuAst) === "Tabs.Content" && node.openingElement.attributes.properties.some((attribute) => attribute.name?.getText(menuAst) === "value" && attribute.initializer?.text === "donations")) donationSection = node;
  ts.forEachChild(node, findDonations);
}
findDonations(menuAst);
assert.ok(donationSection);
const bundle = await build({
  stdin: { contents: `
    import { createElement, Suspense } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Tabs } from 'radix-ui';
    import { BuildingProfileForm } from './src/components/html/donate/BuildingProfileForm';
    import { Button } from './src/components/ui/button';
    import { Dialog, DialogHeader, DialogTitle } from './src/components/ui/dialog';
    import { cn } from './src/lib/utils';
    import { formatBRL } from './src/lib/unlock';
    import { Building2, MapPin } from 'lucide-react';
    import { BlockLoader, ErrorMark, PixelBuilding } from './src/components/ui/pixel-icon';
    import { AuthContext } from './src/hooks/useAuth';
    import { MyBuildingsNavigation } from './src/components/html/MyBuildingsNavigation';
    export { MyBuildingsNavigation };
    export const renderNavigation = (props) => renderToStaticMarkup(createElement(MyBuildingsNavigation, props));
    const BuildingCustomizer = () => createElement('div', { 'data-preview': true }, 'Prévia de aparência');
    const Loader2 = () => null;
    const noop = () => {};
    const scrollClass = ${JSON.stringify(constant("scrollClass"))};
    const footerClass = ${JSON.stringify(constant("footerClass"))};
    const tabClass = ${JSON.stringify(constant("tabClass"))};
    function Section({ buildingTab = 'information', ready = true, editBusy = false, dirty = false, error = null }) {
      const profileFormId = 'building-profile';
      const profileEdit = { ready, busy: editBusy, dirty, error };
      const appearanceBusy = false;
      const donationId = 42;
      const customization = {}, catalog = null, textureSettings = {};
      const setBuildingTab = noop, leaveProfile = noop, setProfileEdit = noop, onClose = noop, onSaved = noop;
      const onCustomizationChange = noop, setAppearanceBusy = noop;
      return (${buildingSection.getText(dialogAst)});
    }
    export const render = (props) => renderToStaticMarkup(createElement(AuthContext.Provider, { value: { user: { id: 1 } } }, createElement(Dialog, { open: true }, createElement(Section, props))));
    function List({ donations }) {
      const panelClass = '', goldButton = '';
      const totalDonated = donations.reduce((total, donation) => total + donation.value, 0);
      const onOpenChange = noop, onOpenDonation = noop;
      return <Tabs.Root value="donations">${donationSection.getText(menuAst)}</Tabs.Root>;
    }
    export const renderList = (donations) => renderToStaticMarkup(createElement(List, { donations }));
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, format: "cjs", platform: "node", packages: "external", jsx: "automatic", write: false,
  define: { "import.meta.env": "{}" },
});
const renderModule = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), renderModule, renderModule.exports);
const { render, renderList, MyBuildingsNavigation, renderNavigation } = renderModule.exports;
const navigationProps = {
  value: 50, place: 'Campinas · SP', index: 0, count: 2,
  onPrevious() {}, onNext() {}, onCustomize() {}, onDetails() {}, onClose() {},
};
const navigationHtml = renderNavigation(navigationProps);
assert.match(navigationHtml, /<nav[^>]*aria-label="Meus edifícios na cidade"/);
assert.match(navigationHtml, /Edifício 1 de 2/);
assert.match(navigationHtml, /aria-live="polite"/);
assert.match(navigationHtml, /Campinas · SP/);
assert.doesNotMatch(navigationHtml, /role="dialog"/);
assert.equal((renderNavigation({ ...navigationProps, count: 1 }).match(/disabled=""/g) ?? []).length, 2, "Um único edifício desabilita anterior/próximo");
const locatingHtml = renderNavigation({ ...navigationProps, value: undefined });
assert.match(locatingHtml, /Localizando edifício/);
assert.equal((locatingHtml.match(/disabled=""/g) ?? []).length, 4, "Enquanto localiza, só Sair fica disponível");
function buttons(node) {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!node?.props) return [];
  return [...(node.props.onClick ? [node.props] : []), ...buttons(node.props.children)];
}
for (const [label, callback] of [["Edifício anterior", "onPrevious"], ["Próximo edifício", "onNext"], ["Sair dos meus edifícios", "onClose"]]) {
  let called = false;
  const tree = MyBuildingsNavigation({ ...navigationProps, [callback]: () => { called = true; } });
  buttons(tree).find((button) => button['aria-label'] === label).onClick();
  assert.equal(called, true, label);
}
const navigationButtons = buttons(MyBuildingsNavigation(navigationProps));
for (const label of ['Edifício anterior', 'Próximo edifício']) {
  const button = navigationButtons.find((item) => item['aria-label'] === label);
  assert.equal(typeof button.children, 'object', 'Setas mostram só ícone');
  assert.match(button.className, /absolute top-1\/2/);
}
for (const [label, callback] of [['Ver como visitante', 'onDetails'], ['Personalizar', 'onCustomize']]) {
  let called = false;
  const action = buttons(MyBuildingsNavigation({ ...navigationProps, [callback]: () => { called = true; } }))
    .find((button) => button['aria-label'] === label || button.children?.includes?.(label));
  assert.equal(action.variant ?? 'default', label === 'Personalizar' ? 'default' : 'outline', 'Ações com fundo do DS');
  action.onClick();
  assert.equal(called, true, label);
}
const listHtml = renderList([{ id: 42, value: 50 }, { id: 99, value: 25 }]);
assert.equal((listHtml.match(/<button/g) ?? []).length, 2, "Todos os edifícios têm Ver na cidade, sem depender do filtro");
assert.match(listHtml, /Edifício 1/);
assert.match(listHtml, /Edifício 2/);
assert.match(renderList([]), /Nenhum edifício ainda/);
const informationHtml = render({});
assert.match(informationHtml, /aria-selected="true"[^>]*>Informações<\/button>/);
assert.match(informationHtml, /Nome do edifício/);
assert.match(informationHtml, /Descrição/);
assert.doesNotMatch(informationHtml, /<details|data-preview/, "Informações não ficam recolhidas nem depois da prévia");
assert.match(informationHtml, /type="submit" form="building-profile"/);
assert.match(render({ buildingTab: "appearance" }), /<form id="building-profile"/, "Alternar de aba não desmonta o perfil nem perde os campos");
assert.match(render({ buildingTab: "appearance" }), /data-preview="true"/);
assert.doesNotMatch(render({ buildingTab: "appearance" }), /type="submit"/, "Aparência salva automaticamente, sem botão Salvar de perfil vazio");
assert.match(render({ buildingTab: "appearance" }), />Concluir<\/button>/);
assert.match(render({ buildingTab: "appearance", dirty: true }), /type="submit" form="building-profile"/, "Informações editadas continuam salváveis ao mudar para Aparência");
assert.match(render({ buildingTab: "appearance", dirty: true }), /Informações não salvas/);
for (const props of [{ ready: false }, { editBusy: true }]) {
  assert.match(render(props), /type="submit" form="building-profile"[^>]*disabled=""/, "Rodapé deve respeitar carregamento e salvamento");
}
assert.match(render({ buildingTab: "appearance", error: "Não foi possível salvar." }), /role="alert"[^]*?<span>Não foi possível salvar\./, "Falha ao salvar deve aparecer também na aba Aparência");

// Foco real: filtro/teto, chegada atrasada do edifício pago e sessão sem permissão.
const editorSource = await readFile(new URL("../src/components/CitySceneEditor.tsx", import.meta.url), "utf8");
const editorAst = ts.createSourceFile("CitySceneEditor.tsx", editorSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const editor = editorAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "CitySceneEditor");
const openDonation = editor.body.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(editorAst) === "handleOpenDonation"));
const callbacks = editor.body.statements.filter(ts.isVariableStatement).filter((node) => node.declarationList.declarations.some((declaration) => ["handleBuildingClick", "handleCloseInfo", "handleManageFromInfo", "handleCloseManagement", "canEdit"].includes(declaration.name.getText(editorAst))));
const rebuild = editor.body.statements.find((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(editorAst) === "useEffect" && node.getText(editorAst).includes("setDonations(visibleDonations)"));
const frames = [];
const city = {
  visibleDonations: [{ id: 42, value: 25 }], donationsApplied: true,
  loadState: { status: "ready" }, ownedDonationIds: new Set([42]), isAdmin: false,
  pendingFocusRef: { current: null }, customizationsRef: { current: new Map() },
  selectedId: null, infoId: null, focusedId: null, showBuildingInfo: true, filter: { cityId: 99 }, limit: 1,
  myBuildingsOpen: false, scrollRef: { current: null },
  get infoBuildingId() { return city.infoId; },
  get selectedBuildingId() { return city.selectedId; },
  useCallback: (handler) => handler,
  useEffect: (handler) => handler(),
  getBuildingSelection: () => ({ managedId: city.selectedId, infoId: city.infoId }),
  setInfoBuildingId: (id) => { city.infoId = id; },
  setShowBuildingInfo: (show) => { city.showBuildingInfo = show; },
  setMyBuildingsOpen: (open) => { city.myBuildingsOpen = open; },
  setSelectedBuildingId: (id) => { city.selectedId = id; },
  setProfileEditId: (id) => { city.profileEditId = id; },
  setInfoProfile: (profile) => { city.infoProfile = profile; },
  setDonationsApplied: (value) => { city.donationsApplied = value; },
  setFilter: (value) => { city.filter = value; },
  setVisibleLimit: (value) => { city.limit = value; },
  requestAnimationFrame: (handler) => { frames.push(handler); return frames.length; },
  cancelAnimationFrame() {},
};
city.canvasRef = { current: {
  focusOnDonation(id) { city.focusedId = id; },
  clearFocus() { city.focusedId = null; },
  setDonations(entries) { city.renderedIds = entries.map((entry) => entry.id); },
  updateDonationCustomization() {},
} };
const code = `${callbacks.map((node) => node.getText(editorAst)).join("\n")}\n${openDonation.getText(editorAst)}\nObject.assign(globalThis, { handleOpenDonation, handleBuildingClick, handleCloseInfo, handleManageFromInfo, handleCloseManagement, canEdit });`;
vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, city);
assert.equal(city.canEdit(42), true);
assert.equal(city.canEdit(99), false, "Conta comum não administra edifício alheio");
city.ownedDonationIds.clear();
assert.equal(city.canEdit(42), false, "Logout remove acesso à administração");
city.isAdmin = true;
assert.equal(city.canEdit(42), true);
city.handleOpenDonation(42);
assert.equal(city.focusedId, 42);
assert.equal(city.infoId, 42);
assert.equal(city.filter.cityId, 99, "Edifício visível preserva filtro");
city.visibleDonations = [];
city.handleOpenDonation(42);
assert.equal(Object.keys(city.filter).length, 0, "Edifício oculto limpa filtro");
assert.equal(city.limit, null, "Edifício oculto remove teto");
const applyCity = () => {
  vm.runInNewContext(ts.transpileModule(rebuild.getText(editorAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, city);
  while (frames.length) frames.shift()();
};
applyCity();
assert.equal(city.pendingFocusRef.current, 42, "Rebuild anterior à resposta não perde foco pendente");
city.visibleDonations = [{ id: 42, value: 25 }];
applyCity();
assert.equal(city.pendingFocusRef.current, null);
assert.equal(city.focusedId, 42);
assert.equal(city.infoId, 42);
assert.equal(city.selectedId, null, "Visualizar abre informações, sem forçar edição");
city.visibleDonations = [{ id: 42, value: 50 }];
applyCity();
assert.equal(city.infoId, 42, "Releitura após revelar edifício oculto mantém informações");
assert.equal(city.focusedId, 42);
city.selectedId = 42;
city.infoId = null;
applyCity();
assert.equal(city.selectedId, 42, "Atualização dos edifícios não desmonta administração nem perde campos");
assert.equal(city.focusedId, 42);
city.pendingFocusRef.current = 42;
city.handleCloseInfo();
assert.equal(city.pendingFocusRef.current, null, "Fechar cancela foco pendente");
assert.equal(city.focusedId, null);
city.selectedId = null;
city.infoId = 42;
vm.runInNewContext(ts.transpileModule(rebuild.getText(editorAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, city);
city.handleCloseInfo();
while (frames.length) frames.shift()();
assert.equal(city.infoId, null, "Fechar durante rebuild não reabre informações");
assert.equal(city.focusedId, null);

// O acesso direto e as setas usam a mesma revelação/foco, sem abrir informações.
city.visibleDonations = [{ id: 42 }, { id: 99 }];
city.donationsApplied = true;
city.handleOpenDonation(42, false);
assert.equal(city.infoId, 42);
assert.equal(city.showBuildingInfo, false);
assert.equal(city.myBuildingsOpen, true, "Acesso direto entra na visualização dedicada");
city.handleBuildingClick(null);
assert.equal(city.infoId, null, "Clique fora fecha a seleção");
assert.equal(city.myBuildingsOpen, false, "Clique fora restaura a interface geral");
assert.equal(city.focusedId, null);
assert.equal(city.pendingFocusRef.current, null);
city.handleOpenDonation(42, false);
city.handleBuildingClick(99);
assert.equal(city.infoId, 99, "Clique em outro edifício abre as informações dele");
assert.equal(city.myBuildingsOpen, false, "Outra seleção também restaura a interface geral");
assert.equal(city.showBuildingInfo, true);
city.handleOpenDonation(42, false);
assert.equal(city.pendingFocusRef.current, null, "Foco imediato não fica pendente para um rebuild futuro");
city.visibleDonations = [];
city.handleOpenDonation(99, false);
applyCity();
assert.equal(city.pendingFocusRef.current, 99);
city.visibleDonations = [{ id: 42 }, { id: 99 }];
applyCity();
assert.equal(city.focusedId, 99);
assert.equal(city.showBuildingInfo, false, "Rebuild não abre card durante navegação direta");
city.handleManageFromInfo();
assert.equal(city.selectedId, 99);
assert.equal(city.infoId, null);
assert.equal(city.myBuildingsOpen, true, 'Personalizar mantém UI geral oculta');
city.handleCloseManagement();
assert.equal(city.infoId, 99);
assert.equal(city.selectedId, null);
assert.equal(city.showBuildingInfo, false, 'Voltar da aparência restaura navegação sem card');
assert.equal(city.myBuildingsOpen, true);
const navigationHandlers = editor.body.statements.filter(ts.isVariableStatement)
  .filter((node) => node.declarationList.declarations.some((declaration) => ["handleBrowseMyBuildings", "handleStepMyBuilding"].includes(declaration.name.getText(editorAst))));
const browsing = {
  myDonations: [{ id: 42 }, { id: 99 }], myBuildingIndex: 0, currentMyBuilding: undefined,
  handleOpenDonation: (id, showInfo) => { browsing.opened = { id, showInfo }; },
  toast: { info: () => { browsing.empty = true; } },
};
vm.runInNewContext(ts.transpileModule(`${navigationHandlers.map((node) => node.getText(editorAst)).join("\n")}\nObject.assign(globalThis, { handleBrowseMyBuildings, handleStepMyBuilding });`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, browsing);
browsing.handleBrowseMyBuildings();
assert.deepEqual(browsing.opened, { id: 42, showInfo: false });
browsing.handleStepMyBuilding(1);
assert.deepEqual(browsing.opened, { id: 99, showInfo: false });
browsing.handleStepMyBuilding(-1);
assert.equal(browsing.opened.id, 99, "Anterior ao primeiro vai ao último");
browsing.myBuildingIndex = 1;
browsing.handleStepMyBuilding(1);
assert.equal(browsing.opened.id, 42, "Próximo ao último volta ao primeiro");
browsing.currentMyBuilding = { id: 99 };
browsing.handleBrowseMyBuildings();
assert.equal(browsing.opened.id, 99, "Atalho refoca o edifício atual");
browsing.myDonations = [{ id: 42 }];
browsing.myBuildingIndex = 0;
browsing.handleStepMyBuilding(1);
assert.equal(browsing.opened.id, 42);
browsing.myDonations = [];
browsing.currentMyBuilding = undefined;
browsing.myBuildingIndex = -1;
browsing.handleBrowseMyBuildings();
assert.equal(browsing.empty, true, "Conta sem edifícios recebe orientação");
browsing.handleStepMyBuilding(1);

// Sair da confirmação vai direto à cidade; contribuição esconde os painéis de seleção.
const scenePanels = new Map();
function findScenePanels(node) {
  if (ts.isJsxSelfClosingElement(node)) {
    scenePanels.set(node.tagName.getText(editorAst), node);
  }
  ts.forEachChild(node, findScenePanels);
}
findScenePanels(editor);
const paidView = scenePanels.get("ContributeDialog").attributes.properties
  .find((attribute) => attribute.name?.getText(editorAst) === "onViewBuilding").initializer.expression;
vm.runInNewContext(ts.transpileModule(`(${paidView.getText(editorAst)})(99);`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, browsing);
assert.deepEqual(browsing.opened, { id: 99, showInfo: false }, "Ver edifício após pagar não abre informações junto com a navegação");
const screen = { booted: true, myBuildingsOpen: true, contributeOpen: true, currentMyBuilding: { id: 42 }, selectedBuildingId: null, showBuildingInfo: true, infoBuildingId: 42, infoBuilding: { value: 50 } };
for (const name of ["MyBuildingsNavigation", "BuildingInfoModal"]) {
  let conditionNode = scenePanels.get(name).parent;
  while (ts.isParenthesizedExpression(conditionNode)) conditionNode = conditionNode.parent;
  const condition = conditionNode.left.getText(editorAst);
  assert.equal(!!vm.runInNewContext(condition, screen), false, `${name} não aparece atrás do pagamento/confirmação`);
  const showingDetails = name === "BuildingInfoModal";
  assert.equal(!!vm.runInNewContext(condition, { ...screen, contributeOpen: false, showBuildingInfo: showingDetails }), true);
  assert.equal(!!vm.runInNewContext(condition, { ...screen, contributeOpen: false, showBuildingInfo: !showingDetails }), false, "Informações e navegação nunca aparecem juntas");
  if (name === 'MyBuildingsNavigation') {
    assert.equal(!!vm.runInNewContext(condition, { ...screen, contributeOpen: false, showBuildingInfo: false, currentMyBuilding: undefined, infoBuildingId: null }), true, 'X continua disponível enquanto aguarda edifício');
  }
}

// Conta/Pix continuam montados, mas escondidos: preserva sessão e acompanhamento.
for (const name of ['AuthMenu', 'ContributeDialog', 'DonationInfoSection']) {
  let wrapper = scenePanels.get(name).parent;
  while (!ts.isJsxElement(wrapper) || !wrapper.openingElement.attributes.properties.some((attribute) => attribute.name?.getText(editorAst) === 'hidden')) wrapper = wrapper.parent;
  const hidden = wrapper.openingElement.attributes.properties.find((attribute) => attribute.name?.getText(editorAst) === 'hidden').initializer.expression;
  for (const myBuildingsOpen of [true, false]) {
    assert.equal(vm.runInNewContext(hidden.getText(editorAst), { myBuildingsOpen }), myBuildingsOpen, `${name}: oculta ao entrar e restaura ao sair`);
  }
}
for (const name of ['BuildingLayoutCard', 'CityControlPanel', 'KeyboardShortcutsHelp']) {
  let conditionNode = scenePanels.get(name).parent;
  while (ts.isParenthesizedExpression(conditionNode)) conditionNode = conditionNode.parent;
  assert.equal(vm.runInNewContext(conditionNode.left.getText(editorAst), { myBuildingsOpen: true }), false, `${name} não aparece na visualização dedicada`);
}
const customize = scenePanels.get('MyBuildingsNavigation').attributes.properties.find((attribute) => attribute.name?.getText(editorAst) === 'onCustomize').initializer.expression;
const manage = { showBuildingInfo: true, managed: false, setShowBuildingInfo: (show) => { manage.showBuildingInfo = show; }, handleManageFromInfo: () => { manage.managed = true; } };
vm.runInNewContext(ts.transpileModule(`(${customize.getText(editorAst)})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, manage);
assert.equal(manage.managed, true);
const initialTab = scenePanels.get('BuildingManageDialog').attributes.properties.find((attribute) => attribute.name?.getText(editorAst) === 'initialTab').initializer.expression;
assert.equal(vm.runInNewContext(initialTab.getText(editorAst), { ...manage, myBuildingsOpen: true }), 'appearance', 'Personalizar abre direto em Aparência');
assert.equal(vm.runInNewContext(initialTab.getText(editorAst), { showBuildingInfo: true, myBuildingsOpen: true }), 'information', 'Administrar pelo card abre Informações');
city.handleCloseInfo();
assert.equal(city.myBuildingsOpen, false, 'X restaura interface geral');
assert.equal(city.focusedId, null);
assert.equal(city.pendingFocusRef.current, null);
city.myBuildingsOpen = true;

const sessionReset = editor.body.statements.find((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(editorAst) === "useEffect" && node.getText(editorAst).includes("[user?.id]"));
city.user = { id: 2 };
vm.runInNewContext(ts.transpileModule(sessionReset.getText(editorAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, city);
assert.equal(city.infoId, null, "Trocar conta encerra navegação anterior");
assert.equal(city.focusedId, null);
assert.equal(city.pendingFocusRef.current, null);
assert.equal(city.myBuildingsOpen, false, 'Trocar conta encerra visualização dedicada');

const shortcuts = editor.body.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(editorAst) === "shortcuts"));
const keyboard = {
  isAdmin: false, myBuildingsOpen: true, selectedBuildingId: 42, infoBuildingId: null, showShortcutsHelp: false, closed: false,
  setShowControlPanel() { keyboard.closed = true; },
};
vm.runInNewContext(ts.transpileModule(`${shortcuts.getText(editorAst)}\nshortcuts.find((shortcut) => shortcut.key === "Escape").handler();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, keyboard);
assert.equal(keyboard.closed, false, "Escape na administração deixa descarte/salvamento sob controle do diálogo");
keyboard.selectedBuildingId = null;
keyboard.infoBuildingId = 42;
keyboard.currentMyBuilding = { id: 42 };
keyboard.showBuildingInfo = true;
keyboard.setShowBuildingInfo = (show) => { keyboard.showBuildingInfo = show; };
keyboard.handleCloseInfo = () => { keyboard.infoBuildingId = null; };
const escapeCode = ts.transpileModule(`{ ${shortcuts.getText(editorAst)}\nshortcuts.find((shortcut) => shortcut.key === "Escape").handler(); }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(escapeCode, keyboard);
assert.equal(keyboard.showBuildingInfo, false, "Escape fecha detalhes sem encerrar navegação");
vm.runInNewContext(escapeCode, keyboard);
assert.equal(keyboard.infoBuildingId, null, "Segundo Escape sai da navegação");

// O atalho próprio chama a navegação direta e não anuncia um modal.
const authSource = await readFile(new URL("../src/components/AuthMenu.tsx", import.meta.url), "utf8");
const authAst = ts.createSourceFile("AuthMenu.tsx", authSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
let ownButton;
function findOwnButton(node) {
  if (ts.isJsxElement(node) && ["button", "Button"].includes(node.openingElement.tagName.getText(authAst)) && node.openingElement.attributes.properties.some((attribute) => attribute.name?.getText(authAst) === "aria-label" && attribute.initializer?.text === "Meus edifícios")) ownButton = node;
  ts.forEachChild(node, findOwnButton);
}
findOwnButton(authAst);
assert.ok(ownButton);
const ownHandler = ownButton.openingElement.attributes.properties.find((attribute) => attribute.name?.getText(authAst) === "onClick").initializer.expression;
const auth = { browsed: false, onBrowseMyBuildings() { auth.browsed = true; } };
vm.runInNewContext(`(${ownHandler.getText(authAst)})()`, auth);
assert.equal(auth.browsed, true);
assert.equal(ownButton.openingElement.attributes.properties.some((attribute) => attribute.name?.getText(authAst) === "aria-haspopup"), false);
console.log("Edifícios: modo dedicado, UI oculta/restaurada, setas, personalização direta, detalhes, sessão e foco após filtro/pagamento OK.");
