// Classify failures without exposing provider message text, prompts or credentials.
export function classifyGeminiError(error) {
  const rawStatus =
    error?.status ??
    error?.response?.status ??
    error?.error?.code ??
    error?.code;
  const number = Number(rawStatus);
  const status =
    Number.isInteger(number) && number >= 400 && number <= 599 ? number : null;
  const result = (code, message, retryable) => ({
    code,
    status,
    message,
    retryable,
  });
  if (error?.code === "MISSING_API_KEY")
    return result(
      "CONFIGURATION",
      "Story AI is not configured correctly. Please contact an organiser.",
      false,
    );
  if (
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    status === 499 ||
    status === 504
  )
    return result(
      "TIMEOUT",
      "Gemini took too long to respond. Please try again shortly.",
      true,
    );
  if (
    status === 401 ||
    status === 403 ||
    (status === 400 &&
      (/api key.*(?:invalid|not valid)|invalid api key/i.test(
        String(error?.message || ""),
      ) ||
        error?.error?.details?.some(
          (detail) => detail.reason === "API_KEY_INVALID",
        )))
  )
    return result(
      "AUTHENTICATION",
      "Gemini access was denied. Please ask an organiser to check the server API key and permissions.",
      false,
    );
  if (status === 402)
    return result(
      "CREDITS_EXHAUSTED",
      "Gemini API credits are exhausted. Please contact an organiser.",
      false,
    );
  if (status === 404)
    return result(
      "MODEL_NOT_FOUND",
      "The configured Gemini model could not be found. Please contact an organiser.",
      false,
    );
  if (status === 400)
    return result(
      "INVALID_CONFIGURATION",
      "The Gemini request settings need attention. Please contact an organiser.",
      false,
    );
  if (status === 429)
    return result(
      "RATE_LIMITED",
      "Gemini request limits were reached. Please try again later or contact an organiser.",
      true,
    );
  if (status === 503)
    return result(
      "UPSTREAM_UNAVAILABLE",
      "Gemini is temporarily unavailable. Please try again shortly.",
      true,
    );
  if (status !== null && status >= 500)
    return result(
      "UPSTREAM_ERROR",
      "Gemini encountered a temporary error. Please try again shortly.",
      true,
    );
  if (error?.name === "TypeError")
    return result(
      "NETWORK",
      "We could not connect to Gemini. Please try again shortly.",
      true,
    );
  return result(
    "INVALID_RESPONSE",
    "The AI response could not be validated. Please contact an organiser.",
    true,
  );
}
export function usesDeprecatedSampling(model) {
  const match = /^gemini-(\d+)(?:\.(\d+))?/.exec(model);
  if (!match) return false;
  const major = Number(match[1]),
    minor = Number(match[2] || 0);
  return (
    major > 3 ||
    (major === 3 &&
      (minor >= 6 || (minor === 5 && model.includes("flash-lite"))))
  );
}
