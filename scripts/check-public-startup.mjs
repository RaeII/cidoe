// Inicialização e abertura do vídeo: sem servidor, navegador ou chamadas à API.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as React from "react";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
for (const [production, hasHtml] of [[true, true], [true, false], [false, true]]) {
  const bundle = await build({
    entryPoints: ["src/main.tsx"], bundle: true, format: "cjs", platform: "node",
    packages: "external", jsx: "automatic", write: false, loader: { ".css": "empty" },
    external: ["./App.tsx", "./lib/analytics.ts"],
    define: { "import.meta.env.PROD": String(production) },
  });
  const root = { hasChildNodes: () => hasHtml };
  let method;
  new Function("require", "document", "window", bundle.outputFiles[0].text)(
    (name) => {
      if (name === "react-dom/client") return {
        hydrateRoot(node) { assert.equal(node, root); method = "hydrate"; },
        createRoot(node) { assert.equal(node, root); return { render() { method = "create"; } }; },
      };
      if (name === "./App.tsx") return { __esModule: true, default: () => null };
      if (name === "./lib/analytics.ts") return { initializeAnalytics() {} };
      return require(name);
    },
    { getElementById: () => root }, { addEventListener() {} },
  );
  assert.equal(method, production && hasHtml ? "hydrate" : "create");
}

const bundle = await build({
  entryPoints: ["src/components/AuthMenu.tsx"], bundle: true, format: "cjs", platform: "node",
  packages: "external", jsx: "automatic", write: false,
  external: ["@/hooks/useAuth", "@/hooks/use-mobile", "@/components/GameMenu", "@/components/pass/RewardDialog"],
  define: { "import.meta.env": '{"PROD":false,"VITE_API_URL":"/api"}' },
});
let state = [], cursor = 0, mobile = false;
const mockedReact = {
  ...React,
  useEffect() {},
  useCallback: (callback) => callback,
  useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
    return [state[index], (value) => { state[index] = value; }];
  },
};
const browser = { location: { search: "" } };
const module = { exports: {} };
new Function("require", "module", "exports", "window", bundle.outputFiles[0].text)(
  (name) => {
    if (name === "react") return mockedReact;
    if (name === "@/hooks/useAuth") return { useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null }) };
    if (name === "@/hooks/use-mobile") return { useIsMobile: () => mobile };
    if (name === "@/components/GameMenu") return {};
    return require(name);
  }, module, module.exports, browser,
);
function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node.props] : []), ...find(node.props.children, predicate)];
}
const props = {
  night: false, onNightChange() {}, myDonations: [], catalog: null,
  rewards: { pending: [] }, onRefreshRewards() {}, onOpenDonation() {}, onBrowseMyBuildings() {},
  authOpen: false, onAuthOpenChange() {}, onboardingBlocked: false,
};
const render = (authOpen = false) => { cursor = 0; return module.exports.AuthMenu({ ...props, authOpen }); };
const intro = (tree) => find(tree, (node) => node.type.name === "IntroVideoDialog")[0];
const login = (tree) => find(tree, (node) => node.type.name === "AuthDialog")[0];
for (mobile of [false, true]) for (const search of ["", "?ref=ABC123"]) {
  browser.location.search = search;
  state = [];
  let tree = render();
  assert.equal(intro(tree).open, false, "Visita ou indicação não abre vídeo automaticamente");
  assert.equal(login(tree).open, false, "Visita ou indicação não abre login automaticamente");
  find(tree, (node) => node.props.title === "Conheça o Cidoe")[0].onClick();
  tree = render();
  assert.equal(intro(tree).open, true, "Botão abre apresentação");
  intro(tree).onOpenChange(false);
  assert.equal(intro(render()).open, false, "Fechar apresentação mantém página acessível");
  tree = render(true);
  assert.equal(intro(tree).open, !mobile, "Login solicitado mantém vídeo no desktop");
  assert.equal(login(tree).open, mobile, "Login solicitado abre diálogo no celular");
  if (search) assert.equal(login(tree).referralCode, "ABC123", "Código de indicação é preservado até o login");
}

const photoBundle = await build({
  entryPoints: ["src/components/ui/photo.tsx"], bundle: true, format: "cjs", platform: "node",
  packages: "external", jsx: "automatic", write: false,
});
const photoModule = { exports: {} };
new Function("require", "module", "exports", photoBundle.outputFiles[0].text)(
  (name) => name === "react" ? mockedReact : require(name), photoModule, photoModule.exports,
);
state = [];
const photo = (src = "/cat_dog.jpeg") => {
  cursor = 0;
  return photoModule.exports.Photo({ src, alt: "Cachorro e gato", ratio: "1/1" });
};
const image = (tree) => find(tree, (node) => node.type === "img")[0];
image(photo()).ref({ complete: true, naturalWidth: 1024 });
assert.doesNotMatch(image(photo()).className, /opacity-0/, "Foto carregada antes da hidratação fica visível");
const changed = photo("/outra.jpg");
assert.match(image(changed).className, /opacity-0/, "Trocar src reinicia a espera");
image(changed).ref({ complete: true, naturalWidth: 0 });
assert.ok(find(photo("/outra.jpg"), (node) => node.props.children === "Foto indisponível").length);
console.log("Inicialização: hidratação do HTML, entrada sem modal, vídeo sob demanda, login/indicação e foto em cache OK.");
