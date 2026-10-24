import { useEffect, useRef, useState } from "react";
import { LeaderboardStories } from "./LeaderboardStories";
import { useStorySlideshow } from "./useStorySlideshow";
import { useFeed } from "./useFeed";
import { getLocale, message, t } from "./i18n";
import type { Entry, Rankings } from "./types";

const score = (value: number | null) =>
  value == null ? "—" : value.toFixed(2);

export function Leaderboard() {
  const historicalRound = new URLSearchParams(window.location.search).get(
    "round",
  );
  const { data, error, updated, refresh } = useFeed<Rankings>(
    "/api/leaderboard" +
      (historicalRound
        ? "?roundId=" + encodeURIComponent(historicalRound)
        : ""),
  );
  const [projector, setProjector] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [view, setView] = useState<"scores" | "story">("scores");
  const readerHeading = useRef<HTMLHeadingElement>(null);
  const focusReader = useRef(false);
  const selectedId = data?.entries.some(
    (entry) => entry.submissionId === selection,
  )
    ? selection
    : (data?.entries[0]?.submissionId ?? null);
  const slideshow = useStorySlideshow(
    data?.entries || [],
    selectedId,
    setSelection,
  );
  useEffect(() => {
    if (selection !== selectedId) setSelection(selectedId);
  }, [selection, selectedId]);
  useEffect(() => {
    if (focusReader.current) {
      readerHeading.current?.focus({ preventScroll: true });
      focusReader.current = false;
    }
    document
      .querySelector<HTMLButtonElement>(
        '.lb-score-panel button[aria-pressed="true"]',
      )
      ?.scrollIntoView({ block: "nearest" });
  }, [view, selectedId]);
  useEffect(() => {
    if (!projector) return;
    const previous = document.activeElement as HTMLElement | null;
    const surroundings = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".topbar, .utility-bar, footer, .skip",
      ),
    );
    const states = surroundings.map((element) => element.inert);
    surroundings.forEach((element) => {
      element.inert = true;
    });
    document
      .querySelector<HTMLButtonElement>(".leaderboard-heading button")
      ?.focus();
    return () => {
      surroundings.forEach((element, index) => {
        element.inert = states[index];
      });
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [projector]);
  useEffect(() => {
    const listener = () => {
      if (!document.fullscreenElement) setProjector(false);
    };
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);
  async function fullscreen() {
    if (projector) {
      setProjector(false);
      if (document.fullscreenElement) await document.exitFullscreen();
    } else {
      setProjector(true);
      slideshow.reset();
      try {
        await document
          .querySelector(".leaderboard-screen")
          ?.requestFullscreen();
      } catch {
        /* The same fitted presentation remains usable without fullscreen. */
      }
    }
  }
  function select(id: string) {
    focusReader.current = window.matchMedia("(max-width: 959px)").matches;
    slideshow.select(id);
    setView("story");
  }
  const eligible = data?.entries.filter((entry) => entry.eligible) || [];
  const provisional = data?.entries.filter((entry) => !entry.eligible) || [];

  function standings(entries: Entry[], official: boolean) {
    return (
      <table
        className="lb-table event-rankings"
        aria-label={
          official ? t("Competition rankings") : t("Provisional standings")
        }
      >
        <colgroup>
          <col className="lb-rank-col" />
          <col className="lb-name-col" />
          <col className="lb-title-col" />
          <col className="lb-score-col" />
          <col className="lb-score-col" />
          <col className="lb-score-col" />
          <col className="lb-votes-col" />
        </colgroup>
        <thead>
          <tr>
            {[
              t("Rank"),
              t("Participant"),
              t("Story"),
              t("AI Score"),
              t("Public Score"),
              t("Total Score"),
              t("Votes"),
            ].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr
              key={entry.submissionId}
              className={`lb-row ${selectedId === entry.submissionId ? "is-selected" : ""} ${official && index < 3 ? `top-ranked place-${index + 1}` : ""}`}
              onClick={() => select(entry.submissionId)}
            >
              <td className="lb-rank">
                <span>
                  {official ? String(index + 1).padStart(2, "0") : "—"}
                </span>
              </td>
              <td className="lb-name">
                <strong>{entry.participantName}</strong>
                <small
                  className={`lb-entry-status ${official ? "is-qualified" : "is-provisional"}`}
                >
                  {official ? t("Award eligible") : t("Provisional")}
                </small>
              </td>
              <td className="lb-title">
                <button
                  aria-pressed={selectedId === entry.submissionId}
                  aria-label={t("Read {title}, by {name}", {
                    title: entry.title,
                    name: entry.participantName,
                  })}
                  onClick={(event) => {
                    event.stopPropagation();
                    select(entry.submissionId);
                  }}
                >
                  {entry.title}
                </button>
                {entry.aiScore == null && (
                  <small>
                    {t("AI judging {status}", {
                      status: t(entry.judgingStatus),
                    })}
                  </small>
                )}
              </td>
              <td className="lb-metric">
                <small>{t("AI Score")}</small>
                {score(entry.aiScore)}
              </td>
              <td className="lb-metric">
                <small>{t("Public Score")}</small>
                {score(entry.averageScore)}
              </td>
              <td className="lb-metric total-score">
                <small>{t("Total Score")}</small>
                <strong>{score(entry.finalScore)}</strong>
              </td>
              <td className="lb-metric">
                <small>{t("Votes")}</small>
                {entry.voteCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <section
      className={`content leaderboard-screen lbcompact ${projector ? "projector" : ""}`}
    >
      <header className="leaderboard-heading">
        <div>
          <p className="eyebrow">{t("Prompt Olympics")}</p>
          <h1>{t("Prompt Olympics Leaderboard")}</h1>
        </div>
        <div className="lb-header-actions">
          <button
            onClick={fullscreen}
            aria-label={
              projector ? t("Exit Presentation") : t("Presentation Mode")
            }
            title={projector ? t("Exit Presentation") : t("Presentation Mode")}
          >
            <svg
              className="lb-action-icon"
              aria-hidden="true"
              viewBox="0 0 24 24"
            >
              <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
            </svg>
            <span className="lb-action-label">
              {projector ? t("Exit Presentation") : t("Presentation Mode")}
            </span>
          </button>
          <button
            onClick={refresh}
            aria-label={t("Refresh Now")}
            title={t("Refresh Now")}
          >
            <svg
              className="lb-action-icon"
              aria-hidden="true"
              viewBox="0 0 24 24"
            >
              <path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3" />
            </svg>
            <span className="lb-action-label">{t("Refresh Now")}</span>
          </button>
        </div>
      </header>
      <div className="lb-toolbar">
        <div className="lb-live">
          <span className="status-dot" />
          {data?.final ? t("Final Results") : t("Live standings")}
          {data && (
            <span>
              {t("Round {number}", { number: data.round.roundNumber })}
            </span>
          )}
        </div>
        {data && (
          <div className="lb-totals" aria-label={t("Event at a glance")}>
            <span>
              <strong>{data.entries.length}</strong> {t("Stories shared")}
            </span>
            <span>
              <strong>
                {data.entries.reduce((sum, entry) => sum + entry.voteCount, 0)}
              </strong>{" "}
              {t("Public ratings")}
            </span>
          </div>
        )}
        <span className="lb-updated">
          {updated
            ? t("Updated at {time}", {
                time: updated.toLocaleTimeString(getLocale(), {
                  hour: "numeric",
                  minute: "2-digit",
                }),
              })
            : t("Loading the latest confirmed rankings…")}
        </span>
        <details className="lb-scoring">
          <summary>{t("How rankings work")}</summary>
          <div>
            <p>{t("Final Score = 50% AI + 50% Public Votes")}</p>
            <p>
              {t(
                "At least {count} public votes are needed to qualify for the final awards.",
                { count: data?.round.minVotes ?? 5 },
              )}
            </p>
            <p>
              {t(
                "50% AI + 50% public average. Public votes required for award eligibility: {count}. Ties: public score, AI score, vote count, then story ID.",
                { count: data?.round.minVotes ?? 5 },
              )}
            </p>
          </div>
        </details>
      </div>
      {error && (
        <p className="lb-refresh-error" role="status">
          {data
            ? t("Connection interrupted. Showing the last confirmed rankings.")
            : message(error)}
        </p>
      )}
      <div
        className="lb-tabs"
        role="tablist"
        aria-label={t("Leaderboard views")}
      >
        {(["scores", "story"] as const).map((tab, index) => (
          <button
            key={tab}
            id={`lb-${tab}-tab`}
            role="tab"
            aria-selected={view === tab}
            aria-controls={`lb-${tab}-panel`}
            tabIndex={view === tab ? 0 : -1}
            onClick={() => setView(tab)}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "scores"
                    : event.key === "End"
                      ? "story"
                      : index
                        ? "scores"
                        : "story";
                setView(next);
                document.getElementById(`lb-${next}-tab`)?.focus();
              }
            }}
          >
            {tab === "scores" ? t("Leaderboard") : t("Read Story")}
          </button>
        ))}
      </div>
      <div className="lb-workspace" data-view={view}>
        <section
          className="lb-score-panel"
          id="lb-scores-panel"
          aria-label={t("Leaderboard")}
        >
          <div className="lb-panel-heading">
            <h2>{t("Leaderboard")}</h2>
            <span>{t("Select a story to read")}</span>
          </div>
          <div
            className="lb-score-scroll"
            tabIndex={0}
            role="region"
            aria-label={t("Scrollable leaderboard")}
          >
            {!data ? (
              <div className="lb-empty" role="status">
                <h2>
                  {error
                    ? t("Retry connection")
                    : t("Loading the latest confirmed rankings…")}
                </h2>
                <button onClick={refresh}>{t("Refresh Now")}</button>
              </div>
            ) : (
              <>
                {!!eligible.length && (
                  <section>
                    <h3 className="lb-group-heading">{t("Award standings")}</h3>
                    {standings(eligible, true)}
                  </section>
                )}
                {!!provisional.length && (
                  <section>
                    <h3 className="lb-group-heading">
                      {t("Provisional standings")}
                    </h3>
                    <p className="lb-group-note">
                      {t(
                        "At least {count} public votes are needed to qualify for the final awards.",
                        { count: data.round.minVotes },
                      )}
                    </p>
                    {standings(provisional, false)}
                  </section>
                )}
                {!data.entries.length && (
                  <div className="lb-empty">
                    <h3>{t("The next great story could be yours")}</h3>
                    <p>{t("No stories in this round yet.")}</p>
                    <a className="button primary" href="/play">
                      {t("Create a Story")}
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
        <LeaderboardStories
          entries={data?.entries || []}
          presentation={projector}
          selectedId={selectedId}
          slideshow={slideshow}
          headingRef={readerHeading}
        />
      </div>
    </section>
  );
}
