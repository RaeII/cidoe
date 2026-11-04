// node scripts/check-city-search.mjs — sem servidor, navegador ou dependências novas.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/citySearch.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { indexCities, searchCities, formatCity, pickTypedCity } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

// Ordem alfabética, como vem de GET /location/cities.
const cities = [
  [1100015, "Alta Floresta D'Oeste", "RO"],
  [3509502, "Campinas", "SP"],
  [2202000, "Campinas do Piauí", "PI"],
  [4303905, "Campinas do Sul", "RS"],
  [3515103, "Embu-Guaçu", "SP"],
  [2924009, "Paulo Afonso", "BA"],
  [3550308, "São Paulo", "SP"],
  [3550407, "São Paulo das Missões", "RS"],
  [2903904, "Bom Jesus", "PI"],
  [4302204, "Bom Jesus", "RS"],
].map(([id, name, uf]) => ({ id, name, uf }));
const original = structuredClone(cities);
const index = indexCities(cities);
const find = (query, limit) => searchCities(index, query, limit).map(formatCity);

// Sem acento e sem diferenciar maiúsculas.
assert.equal(find("sao paulo")[0], "São Paulo, SP");
assert.equal(find("SÃO PAULO")[0], "São Paulo, SP");
assert.equal(find("  são   paulo ")[0], "São Paulo, SP");
// Prefixo antes de substring: "Paulo Afonso" começa com "paulo", "São Paulo" só contém.
assert.deepEqual(find("paulo"), ["Paulo Afonso, BA", "São Paulo, SP", "São Paulo das Missões, RS"]);
// Nome exato vem antes das extensões (ordem alfabética preservada dentro do grupo).
assert.deepEqual(find("campinas"), ["Campinas, SP", "Campinas do Piauí, PI", "Campinas do Sul, RS"]);
// UF digitada junto, com ou sem vírgula.
assert.deepEqual(find("campinas, sp"), ["Campinas, SP"]);
assert.deepEqual(find("campinas sp"), ["Campinas, SP"]);
// Pontuação e hífen viram espaço.
assert.deepEqual(find("d'oeste"), ["Alta Floresta D'Oeste, RO"]);
assert.deepEqual(find("embu guacu"), ["Embu-Guaçu, SP"]);
// Poucos resultados visíveis.
assert.equal(find("a", 3).length, 3);
assert.equal(searchCities(index, "a").length <= 6, true);
// Vazio ou só pontuação: nada (não a lista inteira).
assert.deepEqual(find(""), []);
assert.deepEqual(find("  ,  "), []);
assert.deepEqual(find("xyz"), []);
// Digitou sem clicar: escolhe só quando não há dúvida.
const typed = (query) => pickTypedCity(searchCities(index, query), query);
assert.equal(formatCity(typed("campinas")), "Campinas, SP"); // nome exato entre 3 resultados
assert.equal(formatCity(typed("sao paulo")), "São Paulo, SP");
assert.equal(formatCity(typed("campinas do s")), "Campinas do Sul, RS"); // resultado único
assert.equal(typed("bom jesus"), null); // mesmo nome em duas UFs
assert.equal(formatCity(typed("bom jesus rs")), "Bom Jesus, RS");
assert.equal(typed("camp"), null);
assert.equal(typed("xyz"), null);
assert.deepEqual(cities, original, "Busca não pode alterar a lista recebida");
console.log("Busca de cidade: acento, maiúsculas, prefixo antes de substring, UF, pontuação, limite e escolha por texto OK.");
