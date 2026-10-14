let csrf = "",
  adminCsrf = "";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function setAdminCsrf(value: string) {
  adminCsrf = value;
}
export async function session() {
  const response = await fetch("/api/session");
  if (!response.ok) throw new Error("The event session could not be restored.");
  csrf = (await response.json()).csrf;
}
export async function api<T>(
  url: string,
  body?: unknown,
  key?: string,
  signal?: AbortSignal,
): Promise<T> {
  const admin = url.startsWith("/api/admin/") && !url.endsWith("/login");
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": admin ? adminCsrf : csrf,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.error || "The connection was interrupted. Please try again.",
      response.status,
    );
  return data;
}
export function readSaved<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The screen remains usable if storage is restricted. */
  }
}
