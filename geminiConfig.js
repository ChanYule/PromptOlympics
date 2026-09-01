export const DEFAULT_MODEL = "gemini-2.5-flash";

const MODEL_ALIASES = new Map([
  ["gemini-3.6-flash", DEFAULT_MODEL],
  ["gemini-3.6-flash-preview", DEFAULT_MODEL],
  ["gemini-3.0-flash", DEFAULT_MODEL],
  ["gemini-3.0-pro", DEFAULT_MODEL],
]);

export function normalizeModelName(value) {
  if (typeof value !== "string") {
    return DEFAULT_MODEL;
  }

  const trimmed = value.trim().replace(/^['"]+|['"]+$/g, "");
  if (!trimmed) {
    return DEFAULT_MODEL;
  }

  const lower = trimmed.toLowerCase();
  return MODEL_ALIASES.get(lower) ?? trimmed;
}
