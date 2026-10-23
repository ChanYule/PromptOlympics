import { StoryArt } from "./StoryArt";
import { GeneratedVote } from "./GeneratedVote";
import { RatingStars } from "./RatingStars";
import { LeaderboardStories } from "./LeaderboardStories";
import { Booth } from "./Booth";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  api,
  session,
  setAdminCsrf,
  readSaved,
  save,
  ApiError,
  finishParticipant,
} from "./api";
import { useFeed } from "./useFeed";
import type { Round, Rankings, Story, Job, RoundState } from "./types";
import {
  t,
  message,
  getLanguage,
  getLocale,
  useLanguage,
  setLanguage,
} from "./i18n";
import "./styles.css";
import "./gameplay.css";
const labels: Record<RoundState, string> = {
  WAITING: "Waiting to begin",
  SUBMISSIONS_OPEN: "Story creation is open",
  SUBMISSIONS_CLOSED: "Story creation is closed",
  VOTING: "Public voting is open",
  RESULTS: "Final results published",
};
const examples = [
  "A robot orders kopi",
  "A chicken becomes a CEO",
  "An uncle joins a K-pop group",
  "A cat becomes a school principal",
];
const score = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(2);
function Feedback({ error }: { error: string }) {
  return error ? (
    <p className="notice error" role="alert">
      {message(error)}
    </p>
  ) : null;
}
function App() {
  const language = useLanguage();
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [path, setPath] = useState(window.location.pathname);
  const [large, setLarge] = useState(() => readSaved("large", false)),
    [contrast, setContrast] = useState(() => readSaved("contrast", false)),
    [reduced, setReduced] = useState(() => readSaved("reduced", false));
  async function init() {
    try {
      await session();
      setReady(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void init();
    const pop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    save("large", large);
    save("contrast", contrast);
    save("reduced", reduced);
  }, [large, contrast, reduced]);
  function navigate(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const p = e.currentTarget.pathname;
    history.pushState({}, "", p);
    setPath(p);
    window.scrollTo(0, 0);
  }
  return (
    <div
      className={`app ${large ? "large-text" : ""} ${contrast ? "contrast" : ""} ${reduced ? "reduced" : ""}`}
    >
      <a className="skip" href="#main">
        {t("Skip to content")}{" "}
      </a>
      <header className="topbar">
        <a className="brand" href="/" onClick={navigate}>
          <span className="brand-mark">
            P<span>O</span>
          </span>
          <span>{t("Prompt Olympics")}</span>
        </a>
        <nav aria-label={t("Main navigation")}>
          {[
            ["/", t("Home")],
            ["/play", t("Create a Story")],
            ["/vote", t("Read and Vote")],
            ["/leaderboard", t("Leaderboard")],
          ].map(([p, label]) => (
            <a
              key={p}
              href={p}
              onClick={navigate}
              aria-current={path === p ? "page" : undefined}
            >
              {t(label)}
            </a>
          ))}
        </nav>
        <a href="/admin" onClick={navigate} className="admin-link">
          {t("Organisers")}{" "}
        </a>
      </header>
      <div className="utility-bar">
        <div
          className="language-switch"
          role="group"
          aria-label={t("Language")}
        >
          <button
            lang="en"
            aria-pressed={language === "en"}
            onClick={() => setLanguage("en")}
          >
            English
          </button>
          <button
            lang="zh-Hans"
            aria-pressed={language === "zh"}
            onClick={() => setLanguage("zh")}
          >
            中文
          </button>
        </div>
        <div className="accessibility" aria-label={t("Reading settings")}>
          <button aria-pressed={large} onClick={() => setLarge(!large)}>
            {t("Aa Larger text")}{" "}
          </button>
          <button
            aria-pressed={contrast}
            onClick={() => setContrast(!contrast)}
          >
            {t("High contrast")}{" "}
          </button>
          <button aria-pressed={reduced} onClick={() => setReduced(!reduced)}>
            {t("Less movement")}{" "}
          </button>
        </div>
      </div>
      <main
        id="main"
        onInvalid={(event) => {
          const field = event.target as HTMLInputElement;
          if (field.validity.valueMissing)
            field.setCustomValidity(t("Please fill in this field."));
          else if (
            field.validity.rangeUnderflow ||
            field.validity.rangeOverflow
          )
            field.setCustomValidity(
              t("Enter a number between {min} and {max}.", {
                min: field.min,
                max: field.max,
              }),
            );
        }}
        onInput={(event) => {
          const field = event.target as HTMLInputElement;
          if (typeof field.setCustomValidity === "function")
            field.setCustomValidity("");
        }}
      >
        {!ready ? (
          <div className="content">
            <Feedback error={error} />
            {error ? (
              <button onClick={init}>{t("Retry connection")}</button>
            ) : (
              <p role="status">{t("Connecting to the event…")}</p>
            )}
          </div>
        ) : path === "/booth" ? (
          <Booth>{(finished) => <Play booth onFinished={finished} />}</Booth>
        ) : path === "/play" ? (
          <Play />
        ) : path === "/vote" ? (
          <Vote />
        ) : path === "/leaderboard" ? (
          <Leaderboard />
        ) : path === "/admin" ? (
          <Admin />
        ) : (
          <Home />
        )}
      </main>
      <footer>
        {t(
          "Prompt Olympics · Ideas, laughter and a little friendly competition.",
        )}{" "}
      </footer>
    </div>
  );
}
function RoundStatus({ round }: { round: Round | null }) {
  return (
    <p className="round-status">
      <span className="status-dot" />
      {round
        ? t("Round {number} · {state}", {
            number: round.roundNumber,
            state: t(labels[round.state]),
          })
        : t("Checking the current round…")}
    </p>
  );
}
function Home() {
  const { data, error, refresh } = useFeed<Round>("/api/competition");
  return (
    <div className="content home-page">
      <section className="hero">
        <div>
          <p className="eyebrow">{t("A competition for every imagination")}</p>
          <h1>
            {t("Turn your idea into a")} <em>{t("funny story.")}</em>
          </h1>
          <p className="intro">
            {t(
              "One little idea. One unexpected ending. Share a laugh, discover new stories, and help choose the crowd favourites.",
            )}{" "}
          </p>
          <RoundStatus round={data} />
          <div className="actions">
            <a className="button primary" href="/booth">
              {t("Start Creating My Story")} <span aria-hidden>↗</span>
            </a>
            <a className="button secondary" href="/vote">
              {t("Read and Vote")}{" "}
            </a>
          </div>
          <Feedback error={error} />
          {error && <button onClick={refresh}>{t("Retry")}</button>}
        </div>
        <div className="hero-note">
          <span className="edition">{t("PROMPT OLYMPICS")}</span>
          <StoryArt />
          <h2>
            {t("Small ideas.")} <br />
            {t("Big laughs.")}{" "}
          </h2>
          <p>
            {t("No writing experience needed.")} <br />
            {t("Just bring your imagination.")}{" "}
          </p>
        </div>
      </section>
      <ol className="steps">
        <li>
          <span>{t("01 / CREATE")}</span>
          <h2>{t("Start with an idea")}</h2>
          <p>
            {t(
              "Tell us who, where, and what goes wrong. Gemini turns your idea into a short story.",
            )}{" "}
          </p>
        </li>
        <li>
          <span>{t("02 / READ & VOTE")}</span>
          <h2>{t("Find your favourites")}</h2>
          <p>
            {t("Read the stories and choose one rating from 1 to 5 stars.")}
          </p>
        </li>
        <li>
          <span>{t("03 / CELEBRATE")}</span>
          <h2>{t("Watch the results")}</h2>
          <p>
            {t(
              "AI judging and public ratings each contribute 50%. Follow the live leaderboard.",
            )}{" "}
          </p>
        </li>
      </ol>
    </div>
  );
}
type GenerationOperation = {
  key: string;
  input: {
    participantName: string;
    prompt: string;
    regenerate: boolean;
    language?: "en" | "zh";
  };
  jobId?: string;
};
function Play({
  booth = false,
  onFinished,
}: { booth?: boolean; onFinished?: () => void } = {}) {
  const loadingHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [ideasOpen, setIdeasOpen] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const compact = window.matchMedia("(max-width: 760px)");
    const change = () => setIdeasOpen(!compact.matches);
    compact.addEventListener("change", change);
    return () => compact.removeEventListener("change", change);
  }, []);

  const round = useFeed<Round>("/api/competition", 30000);
  const [name, setName] = useState(() =>
      readSaved("name", booth ? t("Happy Panda") : ""),
    ),
    [prompt, setPrompt] = useState(() => readSaved("prompt", ""));
  const [operation, setOperation] = useState<GenerationOperation | null>(() =>
    readSaved("generation", null),
  );
  const [job, setJob] = useState<Job | null>(() => readSaved("last-job", null)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recover, setRecover] = useState(false);
  useEffect(() => {
    save("name", name);
    save("prompt", prompt);
  }, [name, prompt]);
  useEffect(() => {
    save("generation", operation);
  }, [operation]);
  useEffect(() => {
    save("last-job", job);
  }, [job]);
  useEffect(() => {
    if (!operation) {
      generateLock.current = false;
      return;
    }
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>,
      controller: AbortController | undefined;
    async function reconcile() {
      controller = new AbortController();
      setBusy(true);
      try {
        let next: Job;
        if (operation!.jobId)
          next = await api<Job>(
            "/api/jobs/" + operation!.jobId,
            undefined,
            undefined,
            controller.signal,
          );
        else
          next = await api<Job>(
            "/api/generate-story",
            operation!.input,
            operation!.key,
            controller.signal,
          );
        if (cancelled) return;
        setJob(next);
        setError("");
        setRecover(false);
        if (!operation!.jobId) setOperation({ ...operation!, jobId: next.id });
        if (next.status === "ready" || next.status === "failed") {
          setOperation(null);
          setBusy(false);
          if (next.status === "failed")
            setError(next.error || "Please contact an organiser.");
        } else timer = setTimeout(reconcile, 2000);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setBusy(false);
          const rejected =
            e instanceof ApiError &&
            e.status >= 400 &&
            e.status < 500 &&
            e.status !== 429;
          setRecover(!rejected);
          if (rejected) setOperation(null);
        }
      }
    }
    void reconcile();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [operation]);
  const generateLock = useRef(false);
  async function generate(regenerate = false) {
    if (busy || operation || generateLock.current) return;
    generateLock.current = true;
    setError("");
    setJob(null);
    setOperation({
      key: crypto.randomUUID(),
      input: {
        participantName: name.trim() || t("Happy Panda"),
        prompt: prompt.trim(),
        regenerate,
        language: getLanguage(),
      },
    });
  }
  useEffect(() => {
    const refresh = () => round.refresh();
    window.addEventListener("competition-update", refresh);
    return () => window.removeEventListener("competition-update", refresh);
  }, [round.refresh]);
  async function retryFailed() {
    if (!job) return;
    try {
      const next = await api<Job>("/api/participant-retry", { jobId: job.id });
      setJob(next);
      setError("");
      setOperation({
        key: "resume-" + job.id,
        input: { participantName: name, prompt, regenerate: false },
        jobId: job.id,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const story = job?.submission;
  useEffect(() => {
    if (story) resultHeading.current?.focus();
  }, [story?.id]);
  const loading = busy && !story;
  useEffect(() => {
    if (loading) loadingHeading.current?.focus();
  }, [loading]);
  function speak() {
    if (!story) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(story.resultText);
    utterance.lang = /\p{Script=Han}/u.test(story.resultText)
      ? "zh-SG"
      : "en-SG";
    speechSynthesis.speak(utterance);
  }
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
    },
    [],
  );
  return (
    <div
      className={`content creation-page ${story || loading ? "reading-mode" : ""}`}
    >
      <div className="page-title">
        <p className="eyebrow">{t("Your imagination starts here")}</p>
        <h1>{t("Create Your Funny Story")}</h1>
        <p className="intro">
          {t("Share your idea and let AI turn it into a funny story.")}
        </p>
        <RoundStatus round={round.data} />
      </div>
      <ol className="creation-stepper" aria-label={t("Story progress")}>
        {[t("Your Name"), t("Your Idea"), t("Your Story")].map((label, i) => {
          const active = story || loading ? 2 : name.trim() ? 1 : 0;
          return (
            <li
              key={i}
              className={
                i < active ? "complete" : i === active ? "active" : "upcoming"
              }
              aria-current={i === active ? "step" : undefined}
            >
              <span aria-hidden="true">{i < active ? "\u2713" : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>
      <Feedback error={error || round.error} />
      {recover && (
        <button
          className="primary"
          onClick={() => {
            setRecover(false);
            setOperation((o) => (o ? { ...o } : o));
          }}
        >
          {t("Check and retry the same request")}{" "}
        </button>
      )}
      {job?.status === "failed" && (
        <button onClick={retryFailed}>{t("Retry this story request")}</button>
      )}
      {loading && (
        <section className="card story-loading" aria-labelledby="loading-title">
          <div className="story-spinner" aria-hidden="true" />
          <h2 id="loading-title" ref={loadingHeading} tabIndex={-1}>
            {t("Your story is on its way")}
          </h2>
          <p role="status" aria-live="polite">
            {job?.status === "queued"
              ? t(
                  "Your request is in the queue. We will start as soon as a space is available.",
                )
              : job?.status === "saving"
                ? t("Your story is written. Saving it to the competition…")
                : t("Turning your idea into a story…")}
          </p>
          <div className="generation-details">
            <strong>{name}</strong>
            <p>{prompt}</p>
          </div>
          <ol className="story-loading-steps" aria-label={t("Story progress")}>
            <li className="done">{t("Idea received")}</li>
            <li aria-current={job?.status !== "saving" ? "step" : undefined}>
              {t("Creating your story")}
            </li>
            <li aria-current={job?.status === "saving" ? "step" : undefined}>
              {t("Saving your story")}
            </li>
          </ol>
          <p className="muted">
            {t("Please keep this page open. You do not need to submit again.")}
          </p>
        </section>
      )}
      {story ? (
        <article className="card story-result">
          <div className="story-meta">
            <span>{story.participantName}</span>
            <span className="badge">{t("Saved to the competition")}</span>
          </div>
          <div className="story-heading">
            <h2 ref={resultHeading} tabIndex={-1}>
              {story.title}
            </h2>
            {"speechSynthesis" in window && (
              <button className="listen-button" onClick={speak}>
                {t("Read aloud")}
              </button>
            )}
          </div>
          <p
            className="story-text"
            lang={/\p{Script=Han}/u.test(story.resultText) ? "zh-Hans" : "en"}
          >
            {story.resultText}
          </p>
          <div className="notice" role="status">
            {story.aiScore
              ? t(
                  "AI score: {score} / 5 · Provisional until public voting is complete.",
                  { score: score(story.aiScore.overall) },
                )
              : job?.status === "failed"
                ? t("Story saved. AI judging needs an organiser’s attention.")
                : t("Story saved. AI judging in progress…")}
          </div>
          <GeneratedVote
            key={story.id}
            story={story}
            round={round.data}
            jobId={job!.id}
            onFinished={booth ? onFinished : undefined}
          />
          {!booth && (
            <div className="actions">
              <button
                onClick={() => {
                  setJob(null);
                  save("last-job", null);
                }}
                disabled={busy}
              >
                {t("Create Another Story")}{" "}
              </button>
              <button onClick={() => generate(true)} disabled={busy}>
                {t("Create another version")}{" "}
              </button>
            </div>
          )}
        </article>
      ) : (
        <form
          className="card creation-form"
          hidden={loading}
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <div className="workspace-heading">
            <span className="workspace-kicker">{t("Your story studio")}</span>
            <p className="hint">
              {t(
                getLanguage() === "zh"
                  ? "Story language: Chinese"
                  : "Story language: English",
              )}
            </p>
          </div>
          <div className="creation-workspace">
            <div className="idea-editor">
              <label htmlFor="nickname">{t("What should we call you?")}</label>
              <p className="hint">
                {t("Use your first name or a fun nickname.")}{" "}
              </p>
              <div className="input-row">
                <input
                  id="nickname"
                  autoComplete="nickname"
                  value={name}
                  maxLength={40}
                  required={!booth}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setName(
                      t("Captain {name}", {
                        name: t(
                          ["Penguin", "Potato", "Wizard"][
                            Math.floor(Math.random() * 3)
                          ],
                        ),
                      }),
                    )
                  }
                >
                  {t("Suggest a name")}{" "}
                </button>
              </div>
              <label htmlFor="idea">
                {t("What should happen in your story?")}
              </label>
              <p className="hint" id="idea-help">
                {t(
                  "Tell us your funniest idea. AI will turn it into a short story.",
                )}
              </p>
              <textarea
                aria-describedby="idea-help idea-count"
                id="idea"
                value={prompt}
                maxLength={700}
                required
                rows={4}
                disabled={busy}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t(
                  "A robot arrives at a family dinner and takes everything literally…",
                )}
              />
              <p className="hint" id="idea-count">
                {t(
                  "{count} / 700 characters · Who is there? Where are they? What goes wrong?",
                  { count: prompt.length },
                )}
              </p>
            </div>
            <details
              className="inspiration"
              open={ideasOpen}
              onToggle={(event) => setIdeasOpen(event.currentTarget.open)}
            >
              <summary>{t("Need an idea?")}</summary>
              <StoryArt compact />
              <p className="hint">
                {t("Pick a starting point. Make it your own.")}
              </p>
              <div className="suggestions">
                {examples.map((x) => (
                  <button
                    type="button"
                    key={x}
                    disabled={busy}
                    onClick={() => {
                      if (
                        !prompt.trim() ||
                        window.confirm(
                          t("Replace your current idea with this suggestion?"),
                        )
                      )
                        setPrompt(t(x));
                    }}
                  >
                    {t(x)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={busy || prompt.length > 640}
                onClick={() =>
                  setPrompt(
                    prompt +
                      t(" Add an unexpected twist and a playful ending."),
                  )
                }
              >
                {t("Add a twist")}{" "}
              </button>
            </details>
          </div>
          <div className="creation-submit">
            <p className="draft-hint">
              {t("Your draft is kept on this device.")}
            </p>
            <button
              className="primary full"
              type="submit"
              disabled={
                busy ||
                !!operation ||
                (!booth && !name.trim()) ||
                !prompt.trim()
              }
            >
              <svg
                className="button-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
              >
                <path d="m4 20 11-11 3 3-11 11M16 3v4m-2-2h4M6 4v4M4 6h4M19 16v4m-2-2h4" />
              </svg>
              {busy ? t("Creating your story…") : t("Create My Funny Story")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
type VoteOperation = { key: string; storyId: string; rating: number };
function Vote() {
  const round = useFeed<Round>("/api/competition", 30000),
    [offset, setOffset] = useState(0);
  const list = useFeed<{ items: Story[]; hasMore: boolean }>(
    "/api/stories?offset=" + offset,
  );
  const [drafts, setDrafts] = useState<Record<string, number>>({}),
    [confirmed, setConfirmed] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [code, setCode] = useState("");
  const [pending, setPending] = useState<VoteOperation | null>(() =>
    readSaved("pending-vote", null),
  );
  useEffect(() => {
    save("pending-vote", pending);
  }, [pending]);
  const voteLock = useRef(false);
  async function submit(op = pending) {
    if (busy || voteLock.current || !op) return;
    voteLock.current = true;
    const request = op;
    setPending(request);
    save("pending-vote", request);
    setBusy(true);
    setError("");
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
      setSuccess("Your vote is recorded. Thank you!");
      setConfirmed((values) => ({
        ...values,
        [request.storyId]: request.rating,
      }));
      list.refresh();
      round.refresh();
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
        list.refresh();
      }
    } finally {
      voteLock.current = false;
      setBusy(false);
    }
  }
  const [selected, setSelected] = useState<string | null>(null);
  const readerHeading = useRef<HTMLHeadingElement>(null);
  const galleryButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (selected) readerHeading.current?.focus();
  }, [selected]);
  function backToGallery() {
    const id = selected;
    setSelected(null);
    requestAnimationFrame(() => {
      if (id) galleryButtons.current[id]?.focus();
    });
  }
  const boothParticipant = readSaved("booth-started", false);
  async function finishBoothParticipant() {
    if (busy || pending) return;
    setBusy(true);
    setError("");
    try {
      const job = readSaved<Job | null>("last-job", null);
      const receipt = readSaved<{ key: string } | null>(
        "booth-vote-confirmed",
        null,
      );
      await finishParticipant({
        ...(job ? { jobId: job.id } : {}),
        ...(receipt ? { voteKey: receipt.key } : {}),
      });
      window.location.assign("/booth");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pageOrder = useRef<{ offset: number; ids: string[] }>({
    offset,
    ids: [],
  });
  if (pageOrder.current.offset !== offset)
    pageOrder.current = { offset, ids: [] };
  for (const s of list.data?.items || [])
    if (!pageOrder.current.ids.includes(s.id)) pageOrder.current.ids.push(s.id);
  const items = [...(list.data?.items || [])].sort(
    (a, b) =>
      pageOrder.current.ids.indexOf(a.id) - pageOrder.current.ids.indexOf(b.id),
  );
  const votingOpen = !!round.data;
  return (
    <div className={`content voting-page ${selected ? "reader-active" : ""}`}>
      <div className="page-title">
        <p className="eyebrow">{t("Discover a little delight")}</p>
        <h1>{t("Read and Vote")}</h1>
        <RoundStatus round={round.data} />
      </div>
      <Feedback error={error || list.error || round.error} />
      <section className="handoff-strip">
        <p className="hint" hidden={!!selected}>
          {boothParticipant
            ? t(
                "Rate stories here, then choose Finish and Start Next Participant before handing over this device.",
              )
            : t(
                "Sharing this device? Each person can rate every story, including their own. Select Next voter before handing over the device.",
              )}
        </p>
        <button
          disabled={busy || !!pending}
          onClick={async () => {
            if (boothParticipant) {
              await finishBoothParticipant();
              return;
            }
            setBusy(true);
            setError("");
            try {
              await api("/api/next-voter", {});
              setDrafts({});
              setConfirmed({});
              pageOrder.current = { offset: 0, ids: [] };
              setOffset(0);
              setCode("");
              setSuccess("Ready for the next voter.");
              list.refresh();
              round.refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {boothParticipant
            ? t("Finish and Start Next Participant")
            : t("Next voter")}
        </button>
        {success === "Ready for the next voter." && (
          <p role="status">{message(success)}</p>
        )}
      </section>
      {boothParticipant && readSaved("participant-reset", null) && (
        <button disabled={busy || !!pending} onClick={finishBoothParticipant}>
          {t("Retry participant reset")}
        </button>
      )}
      <p className="hint" hidden={!!selected}>
        {t(
          "Story creation and voting are always available. Rankings update as people participate.",
        )}
      </p>
      {pending && (
        <div className="notice">
          <p role="status">
            {busy
              ? t("Submitting your vote...")
              : t(
                  "Your vote has not been confirmed yet. Please check it before continuing.",
                )}
          </p>
          {selected !== pending.storyId && (
            <button disabled={busy} onClick={() => submit(pending)}>
              {t("Check and confirm my vote")}
            </button>
          )}
        </div>
      )}
      {round.data?.strictCodes && !round.data.verified && (
        <form
          className="card code-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/api/voter-code", { code });
              round.refresh();
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label htmlFor="code">{t("Your event voting code")}</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={100}
          />
          <button className="primary">{t("Verify my code")}</button>
        </form>
      )}
      <>
        <p className="intro" hidden={!!selected}>
          {t(
            "Find a story that catches your eye. Read it, then share your rating.",
          )}
        </p>
        {!list.data && !list.error && (
          <p role="status">{t("Loading stories…")}</p>
        )}
        {items.length === 0 && list.data && (
          <div className="card gameplay-empty">
            <StoryArt compact />
            <h2>{t("No stories here yet")}</h2>
            <p>{t("Check again once participants have shared their ideas.")}</p>
            <button onClick={list.refresh}>{t("Check for stories")}</button>
          </div>
        )}
        <div
          className={selected ? "focused-story" : "story-grid discovery-grid"}
        >
          {items
            .filter((s) => !selected || s.id === selected)
            .map((s, index) => {
              const voted = confirmed[s.id] !== undefined || !!s.voted;
              const currentRating =
                confirmed[s.id] ??
                (s.voted
                  ? s.rating || 0
                  : (drafts[s.id] ??
                    (pending?.storyId === s.id ? pending.rating : 0)));
              const blocked =
                !votingOpen ||
                (s.own && round.data?.allowSelfVotes === false) ||
                (!!round.data?.strictCodes && !round.data.verified);
              if (!selected)
                return (
                  <article
                    key={s.id}
                    className={`card discovery-card story-tone-${index % 3}`}
                  >
                    <div className="story-card-top">
                      <span className="story-card-number" aria-hidden="true">
                        {String(offset + index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        {voted ? t("Vote Recorded") : t("Ready to read")}
                      </span>
                    </div>
                    <p className="eyebrow">{s.participantName}</p>
                    <h2>{s.title}</h2>
                    <p className="excerpt">
                      {s.resultText.length > 170
                        ? s.resultText.slice(0, 170) + "\u2026"
                        : s.resultText}
                    </p>
                    <button
                      ref={(node) => {
                        galleryButtons.current[s.id] = node;
                      }}
                      className="primary"
                      onClick={() => setSelected(s.id)}
                    >
                      {t("Read and Vote")}
                      <span className="sr-only">: {s.title}</span>
                      <span aria-hidden="true">&#8594;</span>
                    </button>
                  </article>
                );
              return (
                <article
                  key={s.id}
                  className="card vote-card inline-story"
                  aria-labelledby={"story-" + s.id}
                >
                  <p className="eyebrow">
                    {t("A story by {name}", { name: s.participantName })}
                  </p>
                  <button className="back-button" onClick={backToGallery}>
                    &#8592; {t("Back to stories")}
                  </button>
                  <h2 ref={readerHeading} tabIndex={-1} id={"story-" + s.id}>
                    {s.title}
                  </h2>
                  <p
                    className="story-text"
                    lang={
                      /\p{Script=Han}/u.test(s.resultText) ? "zh-Hans" : "en"
                    }
                  >
                    {s.resultText}
                  </p>
                  <RatingStars
                    id={s.id}
                    value={currentRating}
                    disabled={busy || !!pending || voted || blocked}
                    onChange={(value) => {
                      setDrafts((values) => ({ ...values, [s.id]: value }));
                      setError("");
                    }}
                  />
                  {voted && (
                    <p className="notice success" role="status">
                      {confirmed[s.id] !== undefined
                        ? t("Your vote is recorded. Thank you!")
                        : t("Your {rating}-star vote is recorded.", {
                            rating: currentRating,
                          })}
                    </p>
                  )}
                  {pending?.storyId === s.id ? (
                    <button
                      className="primary full"
                      disabled={busy}
                      onClick={() => submit(pending)}
                    >
                      {busy
                        ? t("Submitting your vote...")
                        : t("Check and confirm my vote")}
                    </button>
                  ) : (
                    !voted && (
                      <button
                        className="primary full"
                        disabled={
                          !currentRating || busy || !!pending || blocked
                        }
                        onClick={() =>
                          submit({
                            key: crypto.randomUUID(),
                            storyId: s.id,
                            rating: currentRating,
                          })
                        }
                      >
                        {currentRating
                          ? t("Submit My Vote")
                          : t("Select a rating to continue")}
                      </button>
                    )
                  )}
                  {voted && (
                    <button className="primary full" disabled>
                      {t("Vote Recorded")}
                    </button>
                  )}
                  {voted && (
                    <button className="full" onClick={backToGallery}>
                      {t("Read Another Story")}
                    </button>
                  )}
                  {s.own && round.data?.allowSelfVotes === false && (
                    <p className="notice">
                      {t(
                        "Independent voting mode does not allow ratings of your own story.",
                      )}
                    </p>
                  )}
                </article>
              );
            })}
        </div>
        <div className="actions" hidden={!!selected}>
          <button
            disabled={offset === 0 || busy || !!pending}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            {t("Previous stories")}
          </button>
          <button
            disabled={!list.data?.hasMore || busy || !!pending}
            onClick={() => setOffset(offset + 20)}
          >
            {t("More stories")}
          </button>
          <button disabled={busy || !!pending} onClick={list.refresh}>
            {t("Refresh stories")}
          </button>
        </div>
      </>
    </div>
  );
}
function Leaderboard() {
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
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document
      .querySelector<HTMLButtonElement>(".leaderboard-heading button")
      ?.focus();
    return () => {
      surroundings.forEach((element, index) => {
        element.inert = states[index];
      });
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [projector]);
  useEffect(() => {
    const listener = () => {
      if (!document.fullscreenElement) setProjector(false);
    };
    document.addEventListener("fullscreenchange", listener);
    return () => {
      document.removeEventListener("fullscreenchange", listener);
    };
  }, []);
  async function fullscreen() {
    if (projector) {
      setProjector(false);
      if (document.fullscreenElement) await document.exitFullscreen();
    } else {
      setProjector(true);
      try {
        await document
          .querySelector(".leaderboard-screen")
          ?.requestFullscreen();
      } catch {
        /* Clean presentation layout remains available. */
      }
    }
  }
  const eligible = data?.entries.filter((e) => e.eligible) || [];
  const provisional = data?.entries.filter((e) => !e.eligible) || [];
  function standings(entries: Rankings["entries"], official: boolean) {
    return (
      <div
        className="rankings event-rankings"
        role="table"
        aria-label={
          official ? t("Competition rankings") : t("Provisional standings")
        }
      >
        <div className="rank-row table-heading" role="row">
          {[
            t("Rank"),
            t("Participant"),
            t("Story"),
            t("AI Score"),
            t("Public Score"),
            t("Total Score"),
            t("Votes"),
          ].map((label) => (
            <span key={label} role="columnheader">
              {label}
            </span>
          ))}
        </div>
        {entries.map((e, i) => (
          <div
            className={"rank-row " + (official && i < 3 ? "eligible-top" : "")}
            key={e.submissionId}
            role="row"
          >
            <span className="rank-number" role="cell">
              {official ? String(i + 1).padStart(2, "0") : "\u2014"}
            </span>
            <strong className="participant-cell" role="cell">
              {e.participantName}
              <small>{official ? t("Award eligible") : t("Provisional")}</small>
            </strong>
            <span className="title-cell" role="cell">
              {e.title}
              {e.aiScore == null && (
                <small>
                  {t("AI judging {status}", { status: t(e.judgingStatus) })}
                </small>
              )}
            </span>
            <span className="metric" role="cell">
              <small>{t("AI Score")}</small>
              {score(e.aiScore)}
            </span>
            <span className="metric" role="cell">
              <small>{t("Public Score")}</small>
              {score(e.averageScore)}
            </span>
            <strong className="metric total-score" role="cell">
              <small>{t("Total Score")}</small>
              {score(e.finalScore)}
            </strong>
            <span className="metric" role="cell">
              <small>{t("Votes")}</small>
              {e.voteCount}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <section
      className={`content leaderboard-screen ${projector ? "projector" : ""}`}
    >
      <div className="page-title leaderboard-heading">
        <div>
          <p className="eyebrow">{t("Prompt Olympics")}</p>
          <h1>{t("Prompt Olympics Leaderboard")}</h1>
          <p className="intro">{t("See which funny stories are leading!")}</p>
          <RoundStatus round={data?.round || null} />
        </div>
        <button onClick={fullscreen}>
          {projector ? t("Exit Presentation") : t("Presentation Mode")}
        </button>
      </div>
      <div className="refresh-line">
        <span>
          {updated
            ? t("Updated at {time}", {
                time: updated.toLocaleTimeString(getLocale(), {
                  hour: "numeric",
                  minute: "2-digit",
                }),
              })
            : t("Loading the latest confirmed rankings\u2026")}
        </span>
        <button onClick={refresh}>{t("Refresh Now")}</button>
      </div>
      {error && (
        <p className="refresh-error" role="status">
          {data
            ? t("Connection interrupted. Showing the last confirmed rankings.")
            : message(error)}
        </p>
      )}
      {data && (
        <div className="event-overview" aria-label={t("Event at a glance")}>
          <div>
            <strong>{data.entries.length}</strong>
            <span>{t("Stories shared")}</span>
          </div>
          <div>
            <strong>
              {data.entries.reduce((sum, entry) => sum + entry.voteCount, 0)}
            </strong>
            <span>{t("Public ratings")}</span>
          </div>
          <div>
            <strong>50 / 50</strong>
            <span>{t("AI and public scoring")}</span>
          </div>
        </div>
      )}
      <p className="scoring-summary">
        {t("Final Score = 50% AI + 50% Public Votes")}
      </p>
      <details className="scoring-details">
        <summary>{t("How rankings work")}</summary>
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
      </details>
      {data && (
        <>
          {eligible.length ? (
            <div className="podium event-podium">
              {eligible.slice(0, 3).map((e, i) => (
                <article
                  key={e.submissionId}
                  className={`podium-card place-${i + 1}`}
                >
                  <span
                    className="medal"
                    aria-label={t("Rank {rank}", { rank: i + 1 })}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v5m-4 3h8m-6-3h4v3" />
                    </svg>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="badge">
                    {data.final ? t("Final Results") : t("Award eligible")}
                  </span>
                  <h2>{e.participantName}</h2>
                  <p>{e.title}</p>
                  <strong>
                    {score(e.finalScore)}
                    <small> / 5</small>
                  </strong>
                  <div className="score-detail">
                    {t("AI {ai} \u00b7 Public {public} \u00b7 {count} votes", {
                      ai: score(e.aiScore),
                      public: score(e.averageScore),
                      count: e.voteCount,
                    })}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ranking-waiting">
              <StoryArt compact />
              <h2>{t("The next great story could be yours")}</h2>
              <p>
                {t(
                  "Stories are being created. Public votes will determine the rankings!",
                )}
              </p>
              <small>
                {t(
                  "At least {count} public votes are needed to qualify for the final awards.",
                  { count: data.round.minVotes },
                )}
              </small>
            </div>
          )}
          <div className="leaderboard-layout">
            <div className="leaderboard-results">
              {!!eligible.length && (
                <section>
                  <h2>{t("Award standings")}</h2>
                  {standings(eligible, true)}
                </section>
              )}
              {!!provisional.length && (
                <section className="provisional-standings">
                  <h2>{t("Provisional standings")}</h2>
                  <p className="hint">
                    {t(
                      "Live scores. Awards are confirmed after enough public votes.",
                    )}
                  </p>
                  {standings(provisional, false)}
                </section>
              )}
            </div>
            <LeaderboardStories
              entries={data.entries}
              presentation={projector}
            />
          </div>
          {!data.entries.length && (
            <p className="card">{t("No stories in this round yet.")}</p>
          )}
        </>
      )}
    </section>
  );
}

type AdminData = {
  round: Round;
  data: Record<string, any>;
  metrics: Record<string, any>;
  transitions: RoundState[];
};
function Admin() {
  const [health, setHealth] = useState<{ geminiConfigured: boolean } | null>(
    null,
  );
  const [logged, setLogged] = useState(false),
    [password, setPassword] = useState(""),
    [data, setData] = useState<AdminData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [codes, setCodes] = useState<string[]>([]),
    [minVotes, setMinVotes] = useState(5),
    [strict, setStrict] = useState(false),
    [allowSelfVotes, setAllowSelfVotes] = useState(true);
  async function load() {
    const result = await api<AdminData>("/api/admin/competition");
    setData(result);
    setMinVotes(result.round.minVotes);
    setStrict(!!result.round.strictCodes);
    setAllowSelfVotes(result.round.allowSelfVotes !== false);
  }
  useEffect(() => {
    let gone = false;
    api<{ csrf: string }>("/api/admin/session")
      .then(async (s) => {
        if (gone) return;
        setAdminCsrf(s.csrf);
        setLogged(true);
        await load();
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api<{ csrf: string }>("/api/admin/login", { password });
      setAdminCsrf(s.csrf);
      setPassword("");
      setLogged(true);
      await load();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(
    name: string,
    body: Record<string, unknown> = {},
    confirmation?: string,
  ) {
    if (busy || (confirmation && !window.confirm(t(confirmation)))) return;
    setBusy(true);
    try {
      await api("/api/admin/" + name, {
        ...body,
        ...(confirmation ? { confirm: true } : {}),
      });
      if (name !== "logout") await load();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!logged)
    return (
      <div className="content narrow">
        <form className="card" onSubmit={login}>
          <p className="eyebrow">{t("Organiser access")}</p>
          <h1>{t("Manage the event")}</h1>
          <label htmlFor="admin-password">{t("Organiser password")}</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Feedback error={error} />
          <button className="primary full" disabled={busy}>
            {busy ? t("Signing in…") : t("Sign in")}
          </button>
        </form>
      </div>
    );
  const raw = data?.data;
  const submissions: Story[] = raw?.submissions
    ? raw.submissions.map((s: any) => ({
        id: s.id,
        title: s.title,
        prompt: s.prompt,
        resultText: s.story,
        participantName:
          raw.participants.find((p: any) => p.id === s.participant_id)?.name ||
          "",
        judgingStatus: raw.judgements.find((j: any) => j.submission_id === s.id)
          ?.status,
        deleted: s.deleted,
        legacy: s.legacy,
        roundId: s.round_id,
      }))
    : raw?.rounds?.flatMap((r: any) => r.submissions) || [];
  const jobs: any[] = raw?.jobs || [],
    votes: any[] =
      raw?.votes || raw?.rounds?.flatMap((r: any) => r.votes) || [];
  return (
    <div className="content admin">
      <div className="page-title">
        <div>
          <p className="eyebrow">{t("Event control room")}</p>
          <h1>{t("Organiser Dashboard")}</h1>
          <RoundStatus round={data?.round || null} />
        </div>
        <button
          disabled={busy}
          onClick={async () => {
            await action("logout");
            setLogged(false);
          }}
        >
          {t("Sign out")}{" "}
        </button>
      </div>
      <Feedback error={error} />
      <div className="stats">
        {[
          [t("Stories"), submissions.length],
          [t("Votes"), votes.length],
          [
            t("AI jobs pending"),
            jobs.filter((j) => !["ready", "failed"].includes(j.status)).length,
          ],
          [
            t("Failed requests"),
            jobs.filter((j) => j.status === "failed").length,
          ],
        ].map(([label, count]) => (
          <div className="card" key={label}>
            <span>{t(String(label))}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <h2>{t("Always open")}</h2>
          <p>
            {t(
              "Story creation and voting are always available. Rankings update as people participate.",
            )}
          </p>
        </section>
        <section className="card">
          <h2>{t("Voting rules")}</h2>
          <label htmlFor="minimum">{t("Minimum votes for awards")}</label>
          <input
            id="minimum"
            type="number"
            min={1}
            max={1000}
            value={minVotes}
            onChange={(e) => setMinVotes(Number(e.target.value))}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={allowSelfVotes}
              onChange={(e) => setAllowSelfVotes(e.target.checked)}
            />
            {t("Allow participants to rate their own stories")}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => setStrict(e.target.checked)}
            />{" "}
            {t("Require a one-use event voting code")}{" "}
          </label>
          <button
            disabled={busy}
            onClick={() =>
              action(
                "settings",
                { minVotes, strictCodes: strict, allowSelfVotes },
                t("Update voting rules for this round?"),
              )
            }
          >
            {t("Save rules")}{" "}
          </button>
          <p className="hint">
            {t(
              "Anonymous sessions are convenient. Codes provide stronger control. Neither can identify a person using an unrelated browser to submit stories.",
            )}{" "}
          </p>
          <button
            disabled={busy || data?.round.state === "RESULTS"}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api<{ codes: string[] }>(
                  "/api/admin/codes",
                  { count: 100 },
                );
                setCodes(result.codes);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Create 100 voting codes")}{" "}
          </button>
          {!!codes.length && (
            <>
              <p>
                {t(
                  "Copy and distribute privately. Each code can be claimed once.",
                )}{" "}
              </p>
              <textarea
                readOnly
                aria-label={t("New event voting codes")}
                value={codes.join("\n")}
                rows={5}
              />
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(codes.join("\n"))
                    .catch(() =>
                      setError("Select and copy the codes manually."),
                    )
                }
              >
                {t("Copy codes")}{" "}
              </button>
            </>
          )}
        </section>
      </div>
      <section className="card">
        <h2>{t("Exports and event health")}</h2>
        <div className="actions">
          <a
            className="button primary"
            href={"/api/admin/results?language=" + getLanguage()}
          >
            {t("Export results CSV")}{" "}
          </a>
          <a className="button secondary" href="/api/admin/export">
            {t("Download database backup")}{" "}
          </a>
          <button
            disabled={busy}
            onClick={() => load().catch((e) => setError(e.message))}
          >
            {t("Refresh status")}{" "}
          </button>
        </div>
        <p>
          {t(
            "Requests: {requests} · AI failures: {ai} · Database failures: {database}",
            {
              requests: data?.metrics.requests || 0,
              ai: data?.metrics.aiFailure || 0,
              database: data?.metrics.databaseFailure || 0,
            },
          )}
        </p>
        <p>
          {t("Last leaderboard database refresh: {time}", {
            time: data?.metrics.lastLeaderboardRefresh
              ? new Date(data.metrics.lastLeaderboardRefresh).toLocaleString(
                  getLocale(),
                )
              : t("No refresh yet"),
          })}
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            try {
              setHealth(await api("/api/ready"));
              setError("");
            } catch (e) {
              setHealth(null);
              setError((e as Error).message);
            }
          }}
        >
          {t("Check database readiness")}
        </button>
        {health && (
          <p role="status">
            {t("Database connected")} ·{" "}
            {t(
              health.geminiConfigured
                ? "Story AI configured"
                : "Story AI not configured",
            )}
          </p>
        )}
        <details>
          <summary>{t("Round history")}</summary>
          {(raw?.rounds || []).map((r: any) => (
            <p key={r.id}>
              {t("Round {number}: {title} · {state}", {
                number: r.number || r.roundNumber,
                title:
                  r.title === "Prompt Olympics"
                    ? t("Prompt Olympics")
                    : r.title,
                state: t(labels[r.state as RoundState]),
              })}{" "}
              ·{" "}
              <a
                href={"/leaderboard?round=" + encodeURIComponent(r.id)}
                target="_blank"
                rel="noreferrer"
              >
                {t("View stored rankings")}{" "}
              </a>
            </p>
          ))}
        </details>
      </section>
      <section>
        <h2>{t("Review submissions")}</h2>
        <div className="story-grid">
          {submissions.map((s: any) => (
            <article className="card" key={s.id}>
              <p className="eyebrow">
                {s.participantName} · {s.judgingStatus || "pending"}
              </p>
              <h3>{s.title}</h3>
              <details>
                <summary>{t("Read story and idea")}</summary>
                <p>{s.prompt}</p>
                <p className="story-text">{s.resultText}</p>
              </details>
              {s.roundId === data?.round.id && (
                <div className="actions">
                  <button
                    disabled={
                      busy || s.deleted || data?.round.state === "RESULTS"
                    }
                    onClick={() =>
                      action(
                        "delete",
                        { submissionId: s.id },
                        t(
                          "Remove this story from public view? The original record and votes remain in the backup.",
                        ),
                      )
                    }
                  >
                    {s.deleted ? t("Removed") : t("Remove story")}
                  </button>
                  {s.legacy &&
                    s.judgingStatus === "pending" &&
                    !jobs.some(
                      (j) =>
                        j.submission_id === s.id || j.submissionId === s.id,
                    ) && (
                      <button
                        disabled={busy || data?.round.state === "RESULTS"}
                        onClick={() =>
                          action(
                            "judge-historical",
                            { submissionId: s.id },
                            t(
                              "Judge this historical story that has no stored score? This authorised operation is audited. Existing completed scores are preserved.",
                            ),
                          )
                        }
                      >
                        {t("Judge unscored historical story")}{" "}
                      </button>
                    )}
                  {s.judgingStatus === "failed" && (
                    <button
                      disabled={busy || data?.round.state === "RESULTS"}
                      onClick={() =>
                        action("retry-judge", { submissionId: s.id })
                      }
                    >
                      {t("Retry AI judging")}{" "}
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>{t("Failed requests")}</h2>
        {jobs
          .filter((j) => j.status === "failed")
          .map((j) => (
            <p key={j.id}>
              {j.input?.participantName} ·{" "}
              {message(j.error || "AI request failed")} ·{" "}
              {j.submissionId
                ? t("Saved story; retry judging above.")
                : t(
                    "Story was not saved. Participant may create a new request.",
                  )}
            </p>
          ))}
        {!jobs.some((j) => j.status === "failed") && (
          <p>{t("No failed requests.")}</p>
        )}
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
