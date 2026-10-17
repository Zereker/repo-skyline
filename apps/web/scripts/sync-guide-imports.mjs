/**
 * Regenerates the import graph embedded in public/guide.html from the real
 * TypeScript source graph. Run it whenever a production module is added or its
 * imports change; e2e/guide-graph.spec.ts fails when the snapshot drifts.
 */
import ts from "typescript";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const guide = resolve(sourceRoot, "../public/guide.html");

const names = readdirSync(sourceRoot)
  .filter((name) => /\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name))
  .sort();
const known = new Set(names.map((name) => resolve(sourceRoot, name)));

const registry = {};
for (const name of names) {
  const path = resolve(sourceRoot, name);
  const source = ts.createSourceFile(
    name,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const dependencies = new Map();
  for (const node of source.statements) {
    if (
      (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) ||
      !node.moduleSpecifier ||
      !ts.isStringLiteral(node.moduleSpecifier) ||
      !node.moduleSpecifier.text.startsWith(".")
    )
      continue;
    const base = resolve(dirname(path), node.moduleSpecifier.text);
    const destination = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      resolve(base, "index.ts"),
      resolve(base, "index.tsx"),
    ].find((candidate) => known.has(candidate));
    if (!destination) continue;
    const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
    let typeOnly =
      clause?.isTypeOnly || (ts.isExportDeclaration(node) && node.isTypeOnly);
    if (
      clause &&
      !clause.name &&
      clause.namedBindings &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.length
    )
      typeOnly ||= clause.namedBindings.elements.every((element) => element.isTypeOnly);
    const target = relative(sourceRoot, destination);
    if (!dependencies.has(target) || !typeOnly)
      dependencies.set(target, typeOnly ? "T" : "R");
  }
  registry[name] = [...dependencies].sort(([a], [b]) => a.localeCompare(b));
}

const literal = JSON.stringify(
  Object.fromEntries(Object.entries(registry).sort(([a], [b]) => a.localeCompare(b))),
)
  .replace(/","/g, '", "')
  .replace(/\[\[/g, "[\n    [")
  .replace(/\]\],/g, "\n    ]],")
  .replace(/\}\}$/, "\n  }\n}")
  .replace(/^\{"([^"]+)":/, '{\n  "$1":');

let html = readFileSync(guide, "utf8");
const before = html;
html = html.replace(/const IMPORTS = \{[\s\S]*?\};/, `const IMPORTS = ${literal};`);
if (html === before) throw new Error("IMPORTS block not found in guide.html");
writeFileSync(guide, html);

const edges = Object.values(registry).reduce((sum, list) => sum + list.length, 0);
const typeConsumers = Object.entries(registry).filter(([, list]) =>
  list.some(([target]) => target === "types.ts"),
).length;
console.log(
  `synced ${names.length} modules, ${edges} edges, ${typeConsumers} types.ts consumers`,
);
