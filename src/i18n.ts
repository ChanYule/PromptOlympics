import { useSyncExternalStore } from "react";
import { zh, errorZh } from "./locales/zh";
export type Language = "en" | "zh";
export const LANGUAGE_KEY = "prompt-olympics-language";
let language: Language = "en";
try {
  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem(LANGUAGE_KEY) === "zh"
  )
    language = "zh";
} catch {
  /* Reading remains usable with restricted storage. */
}
const listeners = new Set<() => void>();
export function getLanguage() {
  return language;
}
export function getLocale() {
  return language === "zh" ? "zh-SG" : "en-SG";
}
export function setLanguage(value: Language) {
  if (value !== "en" && value !== "zh") return;
  language = value;
  try {
    localStorage.setItem(LANGUAGE_KEY, value);
  } catch {
    /* Keep the current choice in memory. */
  }
  updateDocument();
  listeners.forEach((listener) => listener());
}
function updateDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language === "zh" ? "zh-Hans" : "en";
  document.title =
    language === "zh" ? "提示词奥运会 | Prompt Olympics" : "Prompt Olympics";
}
updateDocument();
export function useLanguage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getLanguage,
    () => "en" as Language,
  );
}
export function t(
  key: string,
  params: Record<string, string | number | undefined> = {},
) {
  const value = language === "zh" ? (zh[key] ?? errorZh[key] ?? key) : key;
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined ? match : String(params[name]),
  );
}
// Error state stores the original server message so changing language also updates existing feedback.
export function message(value: string) {
  if (language === "en" || !value) return value;
  if (errorZh[value] || zh[value]) return t(value);
  const validation = /^Enter (.+) \((\d+) characters or fewer\)\.$/.exec(value);
  if (validation) {
    const fields: Record<string, string> = {
      "your name": "你的名字",
      "a story idea": "故事点子",
      "a challenge": "创作主题",
      "your event code": "比赛投票码",
      "a request key": "请求编号",
      "a round identifier": "比赛轮次编号",
      "a story": "故事编号",
      "a round state": "比赛状态",
      "a round title": "比赛名称",
    };
    return `请输入${fields[validation[1]] ?? "所需内容"}（不超过 ${validation[2]} 个字符）。`;
  }
  return "暂时无法完成此操作，请重试；如问题持续，请联系主办方。";
}
