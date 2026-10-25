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
  const reasons = {
    "The AI response was empty.": "EMPTY_RESPONSE",
    "Invalid story response.": "STORY_SCHEMA",
    "The story did not meet the length requirements.":
      "STORY_LENGTH_OR_LANGUAGE",
    "This idea could not produce a story suitable for a public event.":
      "PUBLIC_SAFETY",
    "Invalid judging response.": "JUDGING_SCHEMA_OR_SCORE",
    "Incomplete judging response.": "JUDGING_EXPLANATION",
    "The AI response was blocked or incomplete.": "INCOMPLETE_RESPONSE",
  };
  // Only allow known enum values into logs. Never include provider text or JSON.
  const finishReason = [
    "STOP",
    "MAX_TOKENS",
    "SAFETY",
    "RECITATION",
    "OTHER",
    "BLOCKLIST",
    "PROHIBITED_CONTENT",
    "SPII",
    "MALFORMED_FUNCTION_CALL",
    "IMAGE_SAFETY",
    "UNEXPECTED_TOOL_CALL",
  ].includes(error?.aiFinishReason)
    ? error.aiFinishReason
    : null;
  return {
    ...result(
      "INVALID_RESPONSE",
      "The AI response could not be validated. Please contact an organiser.",
      true,
    ),
    reason:
      finishReason === "MAX_TOKENS"
        ? "OUTPUT_TOKEN_LIMIT"
        : error instanceof SyntaxError
          ? "MALFORMED_JSON"
          : Object.hasOwn(reasons, error?.message || "")
            ? reasons[error.message]
            : "UNKNOWN",
    finishReason,
  };
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
