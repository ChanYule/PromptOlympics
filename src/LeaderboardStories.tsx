import { api } from "./api";
import { useEffect, useRef, useState } from "react";
import type { Entry } from "./types";
import { t } from "./i18n";
export function LeaderboardStories({
  entries,
  presentation,
}: {
  entries: Entry[];
  presentation: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    () => entries[0]?.submissionId ?? null,
  );
  const [rotationReset, setRotationReset] = useState(0);
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [stories, setStories] = useState<Record<string, string | null>>({});
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const storyCache = useRef<Record<string, string | null>>({});
  useEffect(() => {
    if (
      !selectedId ||
      Object.prototype.hasOwnProperty.call(storyCache.current, selectedId)
    )
      return;
    const controller = new AbortController();
    setError(false);
    const roundId = new URLSearchParams(window.location.search).get("round");
    api<{ story: string | null }>(
      "/api/leaderboard/story/" +
        encodeURIComponent(selectedId) +
        (roundId ? "?roundId=" + encodeURIComponent(roundId) : ""),
      undefined,
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        storyCache.current[selectedId] = data.story;
        setStories({ ...storyCache.current });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [selectedId, retry]);
  const currentEntries = useRef(entries);
  currentEntries.current = entries;
  useEffect(() => {
    if (!entries.some((e) => e.submissionId === selectedId))
      setSelectedId(entries[0]?.submissionId ?? null);
  }, [entries, selectedId]);
  useEffect(() => {
    if (!presentation || paused) return;
    const timer = setInterval(() => {
      if (
        document.hidden ||
        document.querySelector(".app.reduced") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;
      const values = currentEntries.current;
      if (values.length < 2) return;
      setSelectedId(
        (id) =>
          values[
            (Math.max(
              0,
              values.findIndex((e) => e.submissionId === id),
            ) +
              1) %
              values.length
          ].submissionId,
      );
    }, 45000);
    return () => clearInterval(timer);
  }, [presentation, paused, rotationReset]);
  if (!entries.length) return null;
  const index = Math.max(
    0,
    entries.findIndex((e) => e.submissionId === selectedId),
  );
  const visible = [entries[index]];
  function move(step: number) {
    setRotationReset((v) => v + 1);
    setSelectedId(
      entries[(index + step + entries.length) % entries.length].submissionId,
    );
  }
  return (
    <section
      className="leaderboard-stories"
      aria-label={t("Stories on the leaderboard")}
    >
      <h2>
        {presentation ? t("Story spotlight") : t("Stories on the leaderboard")}
      </h2>
      {entries.length > 1 && (
        <div className="spotlight-controls">
          <button onClick={() => move(-1)}>{t("Previous story")}</button>
          <button
            hidden={!presentation}
            aria-pressed={paused}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? t("Resume story rotation") : t("Pause story rotation")}
          </button>
          <button onClick={() => move(1)}>{t("Next story")}</button>
          <p>
            {t("Story {number} of {count}", {
              number: index + 1,
              count: entries.length,
            })}
          </p>
        </div>
      )}
      <div className="leaderboard-story-list">
        {visible.map((e) => (
          <article
            className="card spotlight-story"
            key={e.submissionId}
            aria-labelledby={"leaderboard-story-" + e.submissionId}
          >
            <p className="eyebrow">
              {e.eligible
                ? t("Rank {rank} · A story by {name}", {
                    rank:
                      entries.filter((entry) => entry.eligible).indexOf(e) + 1,
                    name: e.participantName,
                  })
                : t("Provisional · A story by {name}", {
                    name: e.participantName,
                  })}
            </p>
            <h3 id={"leaderboard-story-" + e.submissionId}>{e.title}</h3>
            <p
              className="story-text"
              lang={/\p{Script=Han}/u.test(e.story || "") ? "zh-Hans" : "en"}
            >
              {stories[e.submissionId] ??
                e.story ??
                (error
                  ? t("Story text is unavailable for this entry.")
                  : t("Loading story..."))}
            </p>
            {error && (
              <button onClick={() => setRetry((value) => value + 1)}>
                {t("Retry connection")}
              </button>
            )}
            <p className="score-detail">
              {t("AI {ai} · Public {public} · Combined {combined} / 5", {
                ai: e.aiScore?.toFixed(2) ?? "—",
                public: e.averageScore?.toFixed(2) ?? "—",
                combined: e.finalScore?.toFixed(2) ?? "—",
              })}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
