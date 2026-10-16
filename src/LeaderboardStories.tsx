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
  const currentEntries = useRef(entries);
  currentEntries.current = entries;
  useEffect(() => {
    if (!entries.some((e) => e.submissionId === selectedId))
      setSelectedId(entries[0]?.submissionId ?? null);
  }, [entries, selectedId]);
  useEffect(() => {
    if (!presentation || paused) return;
    const timer = setInterval(() => {
      if (document.hidden || document.querySelector(".app.reduced")) return;
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
  const visible = presentation ? [entries[index]] : entries;
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
      {presentation && entries.length > 1 && (
        <div className="spotlight-controls">
          <button onClick={() => move(-1)}>{t("Previous story")}</button>
          <button aria-pressed={paused} onClick={() => setPaused((v) => !v)}>
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
              {t("Rank {rank} · A story by {name}", {
                rank: entries.indexOf(e) + 1,
                name: e.participantName,
              })}
            </p>
            <h3 id={"leaderboard-story-" + e.submissionId}>{e.title}</h3>
            <p
              className="story-text"
              lang={/\p{Script=Han}/u.test(e.story || "") ? "zh-Hans" : "en"}
            >
              {e.story || t("Story text is unavailable for this entry.")}
            </p>
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
