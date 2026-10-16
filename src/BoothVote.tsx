import { useEffect, useRef, useState } from "react";
import { api, ApiError, finishParticipant, readSaved, save } from "./api";
import { useFeed } from "./useFeed";
import { t, message } from "./i18n";
import type { Entry, Job, Round } from "./types";
type Vote = { key: string; storyId: string; rating: number };
export function BoothVote({
  job,
  round,
  booth,
  onFinished,
}: {
  job: Job;
  round: Round | null;
  booth: boolean;
  onFinished?: () => void;
}) {
  const story = job.submission!;
  const status = useFeed<{ voted: boolean; rating?: number; entry: Entry }>(
    "/api/participant-score/" + story.id,
    job.status === "ready" ? 60000 : 2000,
  );
  const [rating, setRating] = useState(() =>
    readSaved<{ id: string; value: number } | null>("booth-rating", null)
      ?.id === story.id
      ? readSaved<{ value: number }>("booth-rating", { value: 0 }).value
      : 0,
  );
  const [pending, setPending] = useState<Vote | null>(() =>
    readSaved("pending-vote", null),
  );
  const [confirmed, setConfirmed] = useState(() =>
    readSaved<{ storyId: string; key: string } | null>(
      "booth-vote-confirmed",
      null,
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [code, setCode] = useState("");
  const lock = useRef(false);
  const voted = confirmed?.storyId === story.id || status.data?.voted;
  const open =
    round?.state === "VOTING" ||
    (round?.boothMode && round.state === "SUBMISSIONS_OPEN");
  useEffect(
    () => save("booth-rating", { id: story.id, value: rating }),
    [story.id, rating],
  );
  async function submit() {
    if (lock.current) return;
    const request = pending || {
      key: crypto.randomUUID(),
      storyId: story.id,
      rating,
    };
    if (!request.rating) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPending(request);
    save("pending-vote", request);
    try {
      await api(
        "/api/votes",
        { submissionId: request.storyId, rating: request.rating },
        request.key,
      );
      const result = { storyId: request.storyId, key: request.key };
      save("booth-vote-confirmed", result);
      setConfirmed(result);
      save("pending-vote", null);
      setPending(null);
      status.refresh();
    } catch (e) {
      setError((e as Error).message);
      status.refresh();
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 429
      ) {
        save("pending-vote", null);
        setPending(null);
        status.refresh();
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function finish() {
    if (lock.current || pending) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await finishParticipant({
        jobId: job.id,
        ...(confirmed?.storyId === story.id ? { voteKey: confirmed.key } : {}),
      });
      onFinished?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="booth-vote" aria-label={t("Rate your story")}>
      <h3>{t("How funny was your story?")}</h3>
      {error && (
        <p role="alert" className="notice error">
          {message(error)}
        </p>
      )}
      {status.error && (
        <p className="notice">
          {message(status.error)}{" "}
          <button onClick={status.refresh}>{t("Retry")}</button>
        </p>
      )}
      {round?.strictCodes && !round.verified && !voted && (
        <form
          className="code-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/api/voter-code", { code });
              window.dispatchEvent(new Event("competition-update"));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label htmlFor="booth-code">{t("Your event voting code")}</label>
          <input
            id="booth-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={100}
          />
          <button>{t("Verify my code")}</button>
        </form>
      )}
      {voted ? (
        <p className="notice success" role="status">
          {t("Thank you! Your vote has been recorded.")}
        </p>
      ) : (
        <>
          {round?.allowSelfVotes === false ? (
            <p className="notice">
              {t(
                "Independent voting mode does not allow ratings of your own story.",
              )}
            </p>
          ) : (
            <>
              <fieldset
                disabled={
                  busy ||
                  !!pending ||
                  !open ||
                  (!!round?.strictCodes && !round.verified)
                }
              >
                <legend>{t("Choose 1 to 5 stars.")}</legend>
                <div
                  className="stars"
                  role="radiogroup"
                  aria-label={t("Your story rating")}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className={rating >= n ? "chosen" : ""}>
                      <input
                        type="radio"
                        name="own-rating"
                        checked={rating === n}
                        onChange={() => setRating(n)}
                      />
                      <span aria-hidden="true">★</span>
                      <span className="sr-only">
                        {t("Rate {count} out of 5", { count: n })}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {!open && (
                <p className="notice">
                  {t("Voting is not open for this round yet.")}
                </p>
              )}
              <button
                className="primary full"
                disabled={
                  busy ||
                  (!pending &&
                    (!rating ||
                      !open ||
                      (!!round?.strictCodes && !round.verified)))
                }
                onClick={submit}
              >
                {pending
                  ? t("Check and confirm my vote")
                  : busy
                    ? t("Recording your vote…")
                    : t("Submit My Vote")}
              </button>
            </>
          )}
        </>
      )}
      {pending && voted && (
        <button disabled={busy} onClick={submit}>
          {t("Check and confirm my vote")}
        </button>
      )}
      {status.data?.entry?.finalScore != null && (
        <p className="notice" role="status">
          {t("Combined score: {score} / 5", {
            score: status.data.entry.finalScore.toFixed(2),
          })}
        </p>
      )}
      {booth && (voted || round?.allowSelfVotes === false || !!pending) && (
        <button
          className="primary full"
          disabled={
            busy || !!pending || (!voted && round?.allowSelfVotes !== false)
          }
          onClick={finish}
        >
          {t("Finish and Start Next Participant")}
        </button>
      )}
      {booth && readSaved("participant-reset", null) && (
        <button disabled={busy || !!pending} onClick={finish}>
          {t("Retry participant reset")}
        </button>
      )}
    </section>
  );
}
