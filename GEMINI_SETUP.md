# Gemini configuration

Temporary provider failures and configuration failures are now distinguished in both the interface and sanitized `gemini_request_failed` logs. See the Render troubleshooting steps in [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Sampling parameters such as `temperature` are omitted for Gemini 3.6 and later and for Gemini 3.5 Flash-Lite, following [Google's compatibility guidance](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.6). These settings are unrelated to confirming the cause of any particular deployed 503; inspect the provider status in Render's logs.

Set `GEMINI_API_KEY` privately in the server environment/Render Environment panel. Use Google AI Studio to confirm the key's model access and current quota. Never add it to React or a `VITE_` variable.

The existing `gemini-3.6-flash` default is retained as the benchmark. No faster model is asserted to perform better without real measurements. The implementation uses structured JSON schema output and minimal thinking for Gemini 3; title/story generation and judging each have a 768-output-token ceiling and a default 20-second request timeout. The model must return a complete response, title at most five words, and story at most 100 words; invalid output is rejected rather than truncated into a damaged story.

Generation and judging use separate calls. The server stores the story before judging, so the participant can read it immediately. Judging uses humour 50%, originality 25%, relevance 25%, scores from 1–5, and a fixed versioned rubric. Instructions inside story fields are treated as untrusted text; schema/range checks further constrain the result. Prompt injection cannot be guaranteed impossible, so organisers should review suspicious outputs and maintain a consistent rubric.

Temporary 429/server/timeout errors receive at most three attempts with delay and jitter. Invalid/blocked/permanent responses fail clearly. Saved stories remain available when judging fails. Organisers can retry failed judging; successful scores cannot be automatically changed by votes or rejudged through the retry action.

The shared queue caps concurrent leases (`AI_CONCURRENCY`), outstanding jobs (`MAX_QUEUE`), accepted jobs per session/round and accepted jobs per day. Configure provider-side usage/billing alerts as well: accepted-job caps are not a currency quota. Two API calls per successful story and bounded retries must be budgeted. A process crash before persisting model output may repeat a paid call after lease recovery, but does not duplicate the official story.

Test in a rehearsal round through `/play`, inspect saved story and genuine rubric scores, then check Google AI Studio usage and Render metrics. No public AI test endpoint exists. `/api/health` reports configuration only, not verified provider access. Mock AI is local/test-only and forbidden in production.

Official compatibility references consulted during implementation: [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [thinking levels](https://ai.google.dev/gemini-api/docs/thinking), [Gemini 3.6 model](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-6-flash). Access/quota and real latency still require your key and deployment to be tested.
