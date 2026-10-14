import fs from "node:fs";
import ts from "typescript";
import { zh, errorZh } from "../src/locales/zh.ts";
export function auditTranslations() {
  const failures = [];
  const placeholders = (value) =>
    [...value.matchAll(/\{(\w+)\}/g)]
      .map((m) => m[1])
      .sort()
      .join(",");
  for (const [key, value] of Object.entries({ ...zh, ...errorZh })) {
    if (
      !value.trim() ||
      value.includes("\uFFFD") ||
      /(?:Ã|â€|æ¸|ï¿½)/.test(value)
    )
      failures.push("Invalid/garbled translation: " + key);
    if (placeholders(key) !== placeholders(value))
      failures.push("Placeholder mismatch: " + key);
    if (
      key !== "English" &&
      key !== "AI" &&
      /[A-Za-z]/.test(value.replace(/\{\w+\}/g, "")) &&
      !/\p{Script=Han}/u.test(value)
    )
      failures.push("Missing Chinese text: " + key);
  }
  const content = fs.readFileSync("src/main.tsx", "utf8"),
    source = ts.createSourceFile(
      "main.tsx",
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  function visit(n) {
    if (
      ts.isJsxText(n) &&
      /[A-Za-z]/.test(n.text) &&
      !["P", "O", "English"].includes(n.text.trim())
    )
      failures.push("Untranslated JSX: " + n.text.trim());
    if (
      ts.isJsxAttribute(n) &&
      ["aria-label", "placeholder", "title"].includes(n.name.getText(source)) &&
      n.initializer &&
      ts.isStringLiteral(n.initializer)
    )
      failures.push("Untranslated accessible label: " + n.initializer.text);
    if (ts.isCallExpression(n) && n.expression.getText(source) === "t") {
      function check(a) {
        if (ts.isStringLiteral(a) && !(a.text in zh) && !(a.text in errorZh))
          failures.push("Missing key: " + a.text);
        else if (ts.isConditionalExpression(a)) {
          check(a.whenTrue);
          check(a.whenFalse);
        }
      }
      if (n.arguments[0]) check(n.arguments[0]);
    }
    if (
      ts.isBinaryExpression(n) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(n.operatorToken.kind) &&
      ts.isCallExpression(n.right) &&
      n.right.expression.getText(source) === "t"
    )
      failures.push("Translated protocol comparison: " + n.getText(source));
    ts.forEachChild(n, visit);
  }
  visit(source);
  for (const name of ["labels", "ratings", "examples"]) {
    const nodes = [];
    function collect(n) {
      if (
        ts.isVariableDeclaration(n) &&
        n.name.getText(source) === name &&
        n.initializer
      )
        nodes.push(n.initializer);
      ts.forEachChild(n, collect);
    }
    collect(source);
    for (const node of nodes) {
      function strings(n) {
        if (ts.isStringLiteral(n) && !(n.text in zh))
          failures.push("Missing catalog value: " + n.text);
        ts.forEachChild(n, strings);
      }
      strings(node);
    }
  }
  const sql = fs.readFileSync("supabase/migrations/001_normalized.sql", "utf8");
  for (const match of sql.matchAll(/'error','([^']+)'/g))
    if (!(match[1] in errorZh)) failures.push("Missing SQL error: " + match[1]);
  for (const file of [
    "server.js",
    "competitionStore.js",
    "localRepository.js",
    "competitionRepository.js",
  ]) {
    const js = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    function errors(n) {
      if (
        ts.isNewExpression(n) &&
        n.expression.getText(js) === "DomainError" &&
        n.arguments?.[0] &&
        ts.isStringLiteral(n.arguments[0]) &&
        !(n.arguments[0].text in errorZh)
      )
        failures.push("Missing server error: " + n.arguments[0].text);
      ts.forEachChild(n, errors);
    }
    errors(js);
  }
  return {
    entries: Object.keys(zh).length + Object.keys(errorZh).length,
    failures: [...new Set(failures)],
  };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/i18n-audit.mjs")) {
  const result = auditTranslations();
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
}
