import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import { auditTranslations } from "../scripts/i18n-audit.mjs";
import { createAiService, validateStory } from "../aiService.js";
test("all static UI, accessible text, placeholders and server errors have complete Chinese translations", () => {
  const result = auditTranslations();
  assert.deepEqual(result.failures, []);
  assert.ok(result.entries > 200);
});
test("locale switching translates live messages and safely interpolates participant content", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "po-i18n-"));
  try {
    const require = createRequire(import.meta.url);
    const localeURL = new URL("../src/locales/zh.ts", import.meta.url).href;
    let source = fs
      .readFileSync("src/i18n.ts", "utf8")
      .replace('"./locales/zh"', JSON.stringify(localeURL))
      .replace(
        '"react"',
        JSON.stringify(pathToFileURL(require.resolve("react")).href),
      );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const filename = path.join(directory, "i18n.mjs");
    fs.writeFileSync(filename, compiled);
    const i18n = await import(pathToFileURL(filename).href);
    i18n.setLanguage("zh");
    assert.equal(i18n.t("Create a Story"), "创作故事");
    assert.equal(i18n.message("Voting is closed."), "投票已关闭。");
    assert.equal(
      i18n.t("A story by {name}", { name: "<script>保留原名</script>" }),
      "作者：<script>保留原名</script>",
    );
    assert.equal(
      i18n.message("Enter your name (40 characters or fewer)."),
      "请输入你的名字（不超过 40 个字符）。",
    );
    i18n.setLanguage("en");
    assert.equal(i18n.message("Voting is closed."), "Voting is closed.");
    assert.equal(i18n.t("Create a Story"), "Create a Story");
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
test("Chinese generation uses natural Chinese and enforces character limits without changing English rules", async () => {
  const ai = createAiService({ AI_MODE: "mock" }),
    zh = await ai.generate({ language: "zh", prompt: "机器人" }),
    en = await ai.generate({ language: "en", prompt: "Robot" });
  assert.match(zh.title, /\p{Script=Han}/u);
  assert.match(zh.text, /\p{Script=Han}/u);
  assert.equal(en.title, "The Unlikely Chef");
  assert.throws(() =>
    validateStory(
      { title: "标题", text: "字".repeat(401), safeForPublic: true },
      "zh",
    ),
  );
  assert.throws(() =>
    validateStory(
      { title: "English title", text: "English story.", safeForPublic: true },
      "zh",
    ),
  );
  assert.throws(() =>
    validateStory(
      { title: "标题".repeat(7), text: "一个故事。", safeForPublic: true },
      "zh",
    ),
  );
});
