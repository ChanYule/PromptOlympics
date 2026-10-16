# Troubleshooting

## “Gemini is temporarily unavailable” on Render

In the older app, this exact message is returned for an upstream Gemini HTTP error of 500 or above. It does not indicate a bad story idea. The screenshot/message alone cannot distinguish an internal provider error, overload, or a provider deadline. Check the failed request timestamp in **Render → your service → Logs**. Google documents 503 as temporary provider overload/unavailability: [official error reference](https://ai.google.dev/gemini-api/docs/generate-content/api-errors).

1. For **503/500**, wait briefly and retry. Check [Google AI Studio status](https://aistudio.google.com/status). The upgraded queue retries transient failures at most three times with delay; do not repeatedly create new requests.
2. For **429**, check the API project's request/token/day limits in Google AI Studio and reduce the shared `AI_CONCURRENCY` if it exceeds the allowance.
3. For **402**, the API billing balance needs attention. Retrying cannot restore depleted credits.
4. For **400/401/403**, check the detailed code: invalid keys/access require the server key/permissions to be corrected; invalid request settings require a code/configuration correction. Do not change a key simply because of a 503.
5. For **404**, verify `GEMINI_MODEL` against models available to that API project. No automatic model fallback is used, so all participants retain consistent judging.
6. For **timeout**, check provider latency and server network connectivity. The current request timeout is bounded, and the entered idea remains in the browser.

The local fixes do not update Render automatically. After the backup/migration steps in `SUPABASE_SETUP.md`, push the intended code to Render's connected branch and use **Manual Deploy → Deploy latest commit**. Auto-deploy is intentionally disabled in the new Blueprint. Verify the deployed `/api/health` includes `apiVersion: 2` and `languages: ["en", "zh"]`, then check `/api/ready`, the visible language switch, and a rehearsal story. Do not deploy the normalized repository over an unmigrated database.

New worker logs contain a sanitized `gemini_request_failed` event with the provider HTTP status, failure code, stage, model and attempt. Keys, prompts and raw provider messages are excluded. Permanent authentication/configuration errors are not automatically retried. English and Chinese interfaces show the corresponding safe, specific error message.

| What you see                            | What to do                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server refuses to start                 | Check required Supabase variables, private organiser password and session secret. Production cannot use local storage.                                                                      |
| Database readiness returns 503          | Check project availability, server secret, migrations 001/002 and grants in Supabase privately. No local fallback occurs.                                                                   |
| Story creation is disabled              | Check round phase. Only `SUBMISSIONS_OPEN` accepts new jobs.                                                                                                                                |
| Story request is awaiting confirmation  | Use **Check and retry the same request**. Input and operation key remain in the browser. Do not create a new version until the old request is reconciled.                                   |
| Story stays queued                      | Check shared concurrency, provider quota, outstanding jobs and worker health. A restart may require a two-minute lease expiry.                                                              |
| Story is saved but AI judging failed    | Organiser reviews **Failed requests** and uses **Retry AI judging**. No fallback score is supplied.                                                                                         |
| Historical story has no AI score        | Migration preserves it pending. An organiser can explicitly judge an unscored historical story in the current round, or remove it from award consideration; completed scores are preserved. |
| Invalid/too-long/unsafe Gemini response | Request fails with input preserved. Review idea, model access and provider behaviour. No silent truncation or generated placeholder is submitted.                                           |
| Vote confirmation was lost              | Use **Check and confirm my vote**. Exact retries return the committed vote; they cannot create another record.                                                                              |
| Duplicate/self/closed vote rejection    | The vote was not newly accepted. Read another story or ask the organiser about phase/code. Changing the nickname does not change ownership.                                                 |
| Event code is invalid/already used      | Ask the organiser to check distribution. One code belongs to one verified session in that round. Clearing cookies may lose access to the claimed code.                                      |
| Leaderboard refresh fails               | Last confirmed results stay visible. Use **Refresh now** after the connection returns. Hidden tabs pause polling; returning to the tab refreshes it.                                        |
| Publish results is blocked              | Wait for queued work and resolve missing/failed AI scores on visible entries. A removed story is excluded but its original record/votes remain in backups.                                  |
| Organiser session expired               | Sign in again. Never paste the password into chat or use a displayed nickname as the password.                                                                                              |
| Fullscreen unavailable                  | Presentation layout still works. Test the actual projector browser before the event.                                                                                                        |
| Import refuses an occupied database     | Do not overwrite it. Inspect the target and use a dedicated project or reviewed recovery procedure. Exact reruns of the same completed import are safe.                                     |

Run `npm.cmd test` and `npm.cmd run test:e2e` for reproducible local checks. Tests use mocked AI and isolated state; they do not validate hosted credentials. For missing browser binaries, run `npx.cmd playwright install chromium`. Keep server logs free of participant text and secrets.
