export const DEFAULT_MODEL = "gemini-3.6-flash";

export function normalizeModelName(value) {
  if (typeof value !== "string") {
    return DEFAULT_MODEL;
  }

  const trimmed = value.trim().replace(/^['"]+|['"]+$/g, "");
  if (!trimmed) {
    return DEFAULT_MODEL;
  }

  return trimmed;
}
