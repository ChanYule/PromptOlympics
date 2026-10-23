import { useEffect, useRef, useState } from "react";
import { api, ApiError, finishParticipant, readSaved, save } from "./api";
import { t, message } from "./i18n";
import type { Round, Story } from "./types";
import { RatingStars } from "./RatingStars";
type Operation = { key: string; storyId: string; rating: number };
export function GeneratedVote({
  story,
  round,
  jobId,
  onFinished,
}: {
  story: Story;
  round: Round | null;
  jobId: string;
  onFinished?: () => void;
}) {
  const [rating, setRating] = useState(() => {
    const pending = readSaved<Operation | null>("pending-vote", null);
    const draft = readSaved<{ storyId: string; rating: number } | null>(
      "booth-rating",
      null,
    );
    return pending?.storyId === story.id
      ? pending.rating
      : draft?.storyId === story.id
        ? draft.rating
        : 0;
  });
  const [pending, setPending] = useState<Operation | null>(() =>
    readSaved("pending-vote", null),
  );
  const [voted, setVoted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let gone = false;
    api<{ voted?: boolean; rating?: number }>(
      "/api/participant-score/" + encodeURIComponent(story.id),
    )
      .then((data) => {
        if (!gone && data.voted && !readSaved("pending-vote", null)) {
          setVoted(true);
          if (data.rating) setRating(data.rating);
        }
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [story.id]);
  const blocked =
    !round ||
    round?.allowSelfVotes === false ||
    (!!round?.strictCodes && !round.verified);
  async function submit() {
    if (
      lock.current ||
      (voted && !pending) ||
      (!pending && (!rating || blocked))
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    const request = pending || {
      key: crypto.randomUUID(),
      storyId: story.id,
      rating,
    };
    setPending(request);
    save("pending-vote", request);
    try {
      await api(
        "/api/votes",
        { submissionId: request.storyId, rating: request.rating },
        request.key,
      );
      save("booth-vote-confirmed", {
        storyId: request.storyId,
        key: request.key,
      });
      setPending(null);
      save("pending-vote", null);
      if (request.storyId === story.id) {
        setRating(request.rating);
        setVoted(true);
      }
    } catch (e) {
      setError((e as Error).message);
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 429
      ) {
        setPending(null);
        save("pending-vote", null);
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
      const receipt = readSaved<{ key: string } | null>(
        "booth-vote-confirmed",
        null,
      );
      await finishParticipant({
        jobId,
        ...(receipt ? { voteKey: receipt.key } : {}),
      });
      if (onFinished) onFinished();
      else window.location.assign("/booth");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="generated-vote">
      <RatingStars
        id={story.id}
        value={rating}
        disabled={busy || !!pending || voted || blocked}
        onChange={(value) => {
          setRating(value);
          save("booth-rating", { storyId: story.id, rating: value });
        }}
      />
      {error && (
        <p className="notice error" role="alert">
          {message(error)}
        </p>
      )}
      {pending && (
        <p className="hint" role="status">
          {busy
            ? t("Submitting your vote...")
            : t(
                "Your vote has not been confirmed yet. Please check it before continuing.",
              )}
        </p>
      )}
      {round?.allowSelfVotes === false && (
        <p className="hint">
          {t(
            "Independent voting mode does not allow ratings of your own story.",
          )}
        </p>
      )}
      {!!round?.strictCodes && !round.verified && (
        <a className="button" href="/vote">
          {t("Your event voting code")}
        </a>
      )}
      <button
        className="primary full"
        disabled={
          busy || (voted && !pending) || (!pending && (!rating || blocked))
        }
        onClick={submit}
      >
        {voted
          ? t("Vote Recorded")
          : busy
            ? t("Submitting your vote...")
            : pending
              ? t("Check and confirm my vote")
              : rating
                ? t("Submit My Vote")
                : t("Select a rating to continue")}
      </button>
      {voted && (
        <p className="notice success" role="status">
          {t("Thank you for voting!")}
        </p>
      )}
      <div className="actions">
        <a className="button" href="/vote">
          {t("Read Another Story")}
        </a>
        {onFinished && (
          <button disabled={busy || !!pending} onClick={finish}>
            {readSaved("participant-reset", null)
              ? t("Retry participant reset")
              : t("Finish and Start Next Participant")}
          </button>
        )}
      </div>
    </section>
  );
}
