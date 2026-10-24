import { api } from "./api";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Entry } from "./types";
import { t } from "./i18n";
import { STORY_INTERVALS, type useStorySlideshow } from "./useStorySlideshow";
export function LeaderboardStories({
  entries,
  presentation,
  selectedId,
  slideshow,
  headingRef,
}: {
  entries: Entry[];
  presentation: boolean;
  selectedId: string | null;
  slideshow: ReturnType<typeof useStorySlideshow>;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [selectedId]);
  const [stories, setStories] = useState<Record<string, string | null>>({});
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const storyCache = useRef<Record<string, string | null>>({});
  useEffect(() => {
    setError(false);
    if (
      !selectedId ||
      Object.prototype.hasOwnProperty.call(storyCache.current, selectedId)
    )
      return;
    const controller = new AbortController();
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
  const index = Math.max(
    0,
    entries.findIndex((e) => e.submissionId === selectedId),
  );
  const e = entries[index];
  const text = e ? (stories[e.submissionId] ?? e.story) : null;
  const loaded =
    !!e && Object.prototype.hasOwnProperty.call(stories, e.submissionId);
  const unavailable = !text && (error || loaded);
  const number = (value: number | null) =>
    value == null ? "\u2014" : value.toFixed(2);
  return (
    <section
      className="leaderboard-stories lb-reader-panel"
      id="lb-story-panel"
      aria-label={t("Stories on the leaderboard")}
    >
      <div className="lb-panel-heading">
        <h2>{presentation ? t("Story spotlight") : t("Read Story")}</h2>
        <span>
          {entries.length
            ? t("Story {number} of {count}", {
                number: index + 1,
                count: entries.length,
              })
            : t("No story selected")}
        </span>
      </div>
      <div className="lb-slide-progress" aria-hidden="true">
        <span
          key={`${selectedId}-${slideshow.cycle}-${slideshow.seconds}-${slideshow.paused}-${slideshow.suspended}`}
          style={{
            animationDuration: `${slideshow.seconds}s`,
            animationPlayState:
              slideshow.paused || slideshow.suspended || entries.length < 2
                ? "paused"
                : "running",
          }}
        />
      </div>
      {e ? (
        <article
          className="spotlight-story lb-reader-article"
          aria-labelledby={"leaderboard-story-" + e.submissionId}
        >
          <header className="lb-reader-heading">
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
            <h3
              ref={headingRef}
              tabIndex={-1}
              lang={/\p{Script=Han}/u.test(e.title) ? "zh-Hans" : "en"}
              id={"leaderboard-story-" + e.submissionId}
            >
              {e.title}
            </h3>
            <dl className="lb-reader-scores">
              {[
                [t("AI Score"), number(e.aiScore)],
                [t("Public Score"), number(e.averageScore)],
                [t("Total Score"), number(e.finalScore)],
                [t("Votes"), e.voteCount],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </header>
          <div
            className="lb-story-scroll"
            ref={content}
            tabIndex={0}
            role="region"
            aria-label={t("Full story")}
          >
            <p
              className="story-text"
              lang={/\p{Script=Han}/u.test(text || "") ? "zh-Hans" : "en"}
            >
              {text ||
                (unavailable
                  ? t("Story text is unavailable for this entry.")
                  : t("Loading story..."))}
            </p>
            {unavailable && (
              <button
                onClick={() => {
                  storyCache.current = Object.fromEntries(
                    Object.entries(storyCache.current).filter(
                      ([id]) => id !== selectedId,
                    ),
                  );
                  setStories({ ...storyCache.current });
                  setRetry((value) => value + 1);
                }}
              >
                {t("Retry connection")}
              </button>
            )}
          </div>
          <nav
            className="spotlight-controls lb-reader-nav"
            aria-label={t("Story navigation")}
          >
            <div className="lb-story-navigation">
              <button
                disabled={entries.length < 2}
                aria-label={t("Previous story")}
                onClick={() => slideshow.move(-1)}
              >
                <span aria-hidden="true">{"\u2190"}</span>
                {t("Previous")}
              </button>
              <button
                className="lb-slide-toggle"
                disabled={slideshow.suspended}
                aria-label={
                  slideshow.paused || slideshow.suspended
                    ? t("Resume story rotation")
                    : t("Pause story rotation")
                }
                aria-pressed={slideshow.paused || slideshow.suspended}
                onClick={slideshow.toggle}
              >
                <span aria-hidden="true">
                  {slideshow.paused || slideshow.suspended
                    ? "\u25b6"
                    : "\u2161"}
                </span>
                {slideshow.paused || slideshow.suspended
                  ? t("Play")
                  : t("Pause")}
              </button>
              <button
                disabled={entries.length < 2}
                aria-label={t("Next story")}
                onClick={() => slideshow.move(1)}
              >
                {t("Next")}
                <span aria-hidden="true">{"\u2192"}</span>
              </button>
            </div>
            <div className="lb-slide-settings">
              <label htmlFor="story-interval">{t("Change story every")}</label>
              <select
                id="story-interval"
                value={slideshow.seconds}
                onChange={(event) =>
                  slideshow.setSeconds(Number(event.target.value))
                }
              >
                {STORY_INTERVALS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {t("{seconds} seconds", { seconds })}
                  </option>
                ))}
              </select>
              <span role="status">
                {slideshow.suspended
                  ? t("Rotation held by reading settings")
                  : slideshow.paused
                    ? t("Slideshow paused")
                    : entries.length < 2
                      ? t("One story available")
                      : t("Auto-rotation on")}
              </span>
            </div>
          </nav>
        </article>
      ) : (
        <div className="lb-empty">
          <h3>{t("No story selected")}</h3>
          <p>{t("Select a leaderboard entry to read the full story here.")}</p>
        </div>
      )}
    </section>
  );
}
