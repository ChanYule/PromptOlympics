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
const participantKeys = [
  "name",
  "prompt",
  "generation",
  "last-job",
  "pending-vote",
  "booth-vote-confirmed",
  "booth-rating",
  "booth-started",
  "participant-reset",
];
export function clearParticipant() {
  for (const key of participantKeys) sessionStorage.removeItem(key);
}
export async function session() {
  let response = await fetch("/api/session");
  if (!response.ok) throw new Error("The event session could not be restored.");
  let data = await response.json();
  const resetting = readSaved<Record<string, unknown> | null>(
    "participant-reset",
    null,
  );
  if (data.ended && !resetting) {
    response = await fetch("/api/session?fresh=1");
    if (!response.ok)
      throw new Error("The event session could not be restored.");
    data = await response.json();
  }
  csrf = data.csrf;
  if (resetting) {
    if (resetting.context && resetting.context !== csrf) clearParticipant();
    else await finishParticipant();
  }
  const context = readSaved<string>("participant-context", "");
  if (context && context !== csrf) clearParticipant();
  save("participant-context", csrf);
}
export async function finishParticipant(
  input: { jobId?: string; voteKey?: string } = {},
) {
  const request = readSaved<Record<string, unknown> | null>(
    "participant-reset",
    null,
  ) || { ...input, resetKey: crypto.randomUUID(), context: csrf };
  if (readSaved("participant-reset", null)) {
    const response = await fetch("/api/session");
    if (!response.ok)
      throw new Error("The event session could not be restored.");
    const current = await response.json();
    if (request.context && current.csrf !== request.context) {
      csrf = current.csrf;
      clearParticipant();
      save("participant-context", csrf);
      return;
    }
    csrf = current.csrf;
  }
  save("participant-reset", request);
  const result = await api<{ csrf: string }>(
    "/api/finish-participant",
    request,
  );
  csrf = result.csrf;
  clearParticipant();
  save("participant-context", csrf);
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
