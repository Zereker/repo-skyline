import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "@playwright/test";

type Registry = Record<string, [string, "R" | "T"][]>;
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

function embeddedRegistry(): Registry {
  const html = readFileSync(
    new URL("../public/guide.html", import.meta.url),
    "utf8",
  );
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script)
    throw new Error("Guide must contain its inline application script");
  const source = ts.createSourceFile(
    "guide.js",
    script,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((node) => ts.isIdentifier(node.name) && node.name.text === "IMPORTS");
  if (
    !declaration?.initializer ||
    !ts.isObjectLiteralExpression(declaration.initializer)
  )
    throw new Error("Guide import registry must be an inline literal");
  const registry: Registry = {};
  for (const property of declaration.initializer.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isStringLiteral(property.name) ||
      !ts.isArrayLiteralExpression(property.initializer)
    )
      throw new Error("Invalid registry entry");
    registry[property.name.text] = property.initializer.elements.map(
      (element) => {
        if (
          !ts.isArrayLiteralExpression(element) ||
          element.elements.length !== 2
        )
          throw new Error("Invalid dependency pair");
        const [target, kind] = element.elements;
        if (
          !ts.isStringLiteral(target) ||
          !ts.isStringLiteral(kind) ||
          !["R", "T"].includes(kind.text)
        )
          throw new Error("Invalid dependency kind");
        return [target.text, kind.text as "R" | "T"];
      },
    );
  }
  return registry;
}

function actualRegistry(): Registry {
  const names = readdirSync(sourceRoot, { recursive: true }).filter(
    (name): name is string =>
      typeof name === "string" &&
      /\.tsx?$/.test(name) &&
      !/\.(test|spec)\./.test(name),
  );
  const known = new Set(names.map((name) => resolve(sourceRoot, name)));
  const registry: Registry = {};
  for (const name of names) {
    const path = resolve(sourceRoot, name);
    const source = ts.createSourceFile(
      name,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const dependencies = new Map<string, "R" | "T">();
    for (const node of source.statements) {
      if (
        (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) ||
        !node.moduleSpecifier ||
        !ts.isStringLiteral(node.moduleSpecifier)
      )
        continue;
      if (!node.moduleSpecifier.text.startsWith(".")) continue;
      const base = resolve(dirname(path), node.moduleSpecifier.text);
      const destination = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        resolve(base, "index.ts"),
        resolve(base, "index.tsx"),
      ].find((candidate) => known.has(candidate));
      if (!destination) continue;
      const clause = ts.isImportDeclaration(node)
        ? node.importClause
        : undefined;
      let typeOnly =
        clause?.isTypeOnly || (ts.isExportDeclaration(node) && node.isTypeOnly);
      if (
        clause &&
        !clause.name &&
        clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.length
      )
        typeOnly ||= clause.namedBindings.elements.every(
          (element) => element.isTypeOnly,
        );
      const target = relative(sourceRoot, destination);
      if (!dependencies.has(target) || !typeOnly)
        dependencies.set(target, typeOnly ? "T" : "R");
    }
    registry[name] = [...dependencies];
  }
  return registry;
}

test("keeps the single-file guide's dependency snapshot consistent with production imports", () => {
  const normalize = (registry: Registry) =>
    Object.fromEntries(
      Object.entries(registry)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, dependencies]) => [
          file,
          dependencies.sort(([a], [b]) => a.localeCompare(b)),
        ]),
    );
  const embedded = embeddedRegistry();
  expect(normalize(embedded)).toEqual(normalize(actualRegistry()));
  const consumers = Object.entries(embedded).filter(([, imports]) =>
    imports.some(([target]) => target === "types.ts"),
  );
  expect(consumers).toHaveLength(14);
  expect(
    consumers.every(
      ([, imports]) =>
        imports.find(([target]) => target === "types.ts")![1] === "T",
    ),
  ).toBe(true);
});
