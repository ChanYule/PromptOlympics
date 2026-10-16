import { Booth } from "./Booth";
import { BoothVote } from "./BoothVote";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, session, setAdminCsrf, readSaved, save, ApiError } from "./api";
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
const labels: Record<RoundState, string> = {
  WAITING: "Waiting to begin",
  SUBMISSIONS_OPEN: "Story creation is open",
  SUBMISSIONS_CLOSED: "Story creation is closed",
  VOTING: "Public voting is open",
  RESULTS: "Final results published",
};
const ratings = [
  "Not for me",
  "A little funny",
  "Enjoyable",
  "Funny",
  "Loved it",
];
const examples = [
  "A robot takes everything literally at a family dinner.",
  "A grandmother becomes a professional wrestler.",
  "A cat accidentally becomes mayor.",
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
      <div className="language-switch" role="group" aria-label={t("Language")}>
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
        <button aria-pressed={contrast} onClick={() => setContrast(!contrast)}>
          {t("High contrast")}{" "}
        </button>
        <button aria-pressed={reduced} onClick={() => setReduced(!reduced)}>
          {t("Less movement")}{" "}
        </button>
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
    <div className="content">
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
          <span className="hero-symbol" aria-hidden>
            “
          </span>
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
    <div className="content narrow">
      <div className="page-title">
        <p className="eyebrow">{t("Your imagination starts here")}</p>
        <h1>{t("Create a Story")}</h1>
        <RoundStatus round={round.data} />
      </div>
      <ol className="progress">
        <li className={name ? "done" : ""}>{t("1. Your name")}</li>
        <li className={prompt ? "done" : ""}>{t("2. Your idea")}</li>
        <li className={story ? "done" : ""}>{t("3. Read & share")}</li>
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
      {loading ? (
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
      ) : story ? (
        <article className="card story-result">
          <div className="story-meta">
            <span>{story.participantName}</span>
            <span className="badge">{t("Saved to the competition")}</span>
          </div>
          <h2>{story.title}</h2>
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
          <BoothVote
            key={story.id}
            job={job!}
            round={round.data}
            booth={booth}
            onFinished={onFinished}
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
              <button
                onClick={() => generate(true)}
                disabled={busy || round.data?.state !== "SUBMISSIONS_OPEN"}
              >
                {t("Create another version")}{" "}
              </button>
              <a className="button primary" href="/vote">
                {t("Read Other Stories")}{" "}
              </a>
              {"speechSynthesis" in window && (
                <button onClick={speak}>{t("Read aloud")}</button>
              )}
            </div>
          )}
        </article>
      ) : (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <p className="hint">
            {t(
              getLanguage() === "zh"
                ? "Story language: Chinese"
                : "Story language: English",
            )}
          </p>
          <label htmlFor="nickname">
            {t("1. What name would you like to use?")}
          </label>
          <p className="hint">
            {t(
              "Your first name or a nickname will appear beside your story.",
            )}{" "}
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
          <label htmlFor="idea">{t("2. What happens in your story?")}</label>
          <textarea
            id="idea"
            value={prompt}
            maxLength={700}
            required
            rows={6}
            disabled={busy}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t(
              "A robot arrives at a family dinner and takes everything literally…",
            )}
          />
          <p className="hint">
            {t(
              "{count} / 700 characters · Who is there? Where are they? What goes wrong?",
              { count: prompt.length },
            )}
          </p>
          <details>
            <summary>{t("Need an idea?")}</summary>
            <div className="suggestions">
              {examples.map((x) => (
                <button
                  type="button"
                  key={x}
                  disabled={busy}
                  onClick={() => setPrompt(t(x))}
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
                  prompt + t(" Add an unexpected twist and a playful ending."),
                )
              }
            >
              {t("Add a twist")}{" "}
            </button>
          </details>
          <button
            className="primary full"
            type="submit"
            disabled={
              busy ||
              !!operation ||
              (!booth && !name.trim()) ||
              !prompt.trim() ||
              round.data?.state !== "SUBMISSIONS_OPEN"
            }
          >
            {busy
              ? t("Creating your story…")
              : booth
                ? t("Generate My Story")
                : t("Create and save my story")}
          </button>
          {busy && (
            <p className="notice" role="status">
              {job?.status === "queued"
                ? t(
                    "Many stories are being created right now. Your request is in the queue.",
                  )
                : job?.status === "saving"
                  ? t("Saving your story…")
                  : t("Creating your story. Your idea is safely kept here.")}
            </p>
          )}
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
  const [selected, setSelected] = useState<Story | null>(null),
    [rating, setRating] = useState(0),
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
  function open(story: Story) {
    if (busy || pending) return;
    setSelected(story);
    setRating(story.rating || 0);
    setError("");
    setSuccess("");
  }
  async function submit(op = pending) {
    if (busy) return;
    const request = op || {
      key: crypto.randomUUID(),
      storyId: selected!.id,
      rating,
    };
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
      setPending(null);
      save("pending-vote", null);
      setSuccess("Your vote is recorded. Thank you!");
      setSelected((s) =>
        s?.id === request.storyId
          ? { ...s, voted: true, rating: request.rating }
          : s,
      );
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
      setBusy(false);
    }
  }
  const items = list.data?.items || [],
    next = items.find((s) => s.id !== selected?.id && !s.voted);
  return (
    <div className="content">
      <div className="page-title">
        <p className="eyebrow">{t("Discover a little delight")}</p>
        <h1>{t("Read and Vote")}</h1>
        <RoundStatus round={round.data} />
      </div>
      <Feedback error={error || list.error || round.error} />
      <section className="notice">
        <p>
          {t(
            "Sharing this device? Each person can rate every story, including their own. Select Next voter before handing over the device.",
          )}
        </p>
        <button
          disabled={busy || !!pending}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/api/next-voter", {});
              setSelected(null);
              setRating(0);
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
          {t("Next voter")}
        </button>
        {success === "Ready for the next voter." && (
          <p role="status">{message(success)}</p>
        )}
      </section>
      {pending && (
        <div className="notice">
          <p>
            {t(
              "A vote is awaiting confirmation. Retry uses the same request key and cannot add a second vote.",
            )}{" "}
          </p>
          <button disabled={busy} onClick={() => submit(pending)}>
            {t("Check and confirm my vote")}{" "}
          </button>
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
      {selected ? (
        <div className="narrow">
          <button
            disabled={busy || !!pending}
            onClick={() => setSelected(null)}
          >
            {t("← All stories")}{" "}
          </button>
          <article className="card vote-card">
            <p className="eyebrow">
              {t("A story by {name}", { name: selected.participantName })}
            </p>
            <h2>{selected.title}</h2>
            <p
              className="story-text"
              lang={
                /\p{Script=Han}/u.test(selected.resultText) ? "zh-Hans" : "en"
              }
            >
              {selected.resultText}
            </p>
            <fieldset
              disabled={
                busy ||
                selected.voted ||
                (selected.own && round.data?.allowSelfVotes === false) ||
                !!pending ||
                !(
                  round.data?.state === "VOTING" ||
                  (round.data?.boothMode &&
                    round.data?.state === "SUBMISSIONS_OPEN")
                )
              }
            >
              <legend>{t("How funny was this story?")}</legend>
              <div
                className="stars"
                role="radiogroup"
                aria-label={t("Story rating")}
              >
                {ratings.map((label, i) => (
                  <label
                    key={label}
                    className={rating >= i + 1 ? "chosen" : ""}
                  >
                    <input
                      type="radio"
                      name="rating"
                      value={i + 1}
                      checked={rating === i + 1}
                      onChange={() => setRating(i + 1)}
                    />
                    <span aria-hidden>★</span>
                    <span className="sr-only">
                      {t(
                        i === 0
                          ? "{count} star: {label}"
                          : "{count} stars: {label}",
                        { count: i + 1, label: t(label) },
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <p className="hint">
                {rating
                  ? `${rating} / 5 · ${ratings[rating - 1]}`
                  : t("Choose 1 to 5 stars.")}
              </p>
            </fieldset>
            {selected.voted ? (
              <p className="notice success" role="status">
                {success
                  ? message(success)
                  : t("Your {rating}-star vote is recorded.", {
                      rating: selected.rating,
                    })}
              </p>
            ) : (
              <button
                className="primary full"
                onClick={() => submit(null)}
                disabled={
                  !rating ||
                  busy ||
                  !!pending ||
                  !(
                    round.data?.state === "VOTING" ||
                    (round.data?.boothMode &&
                      round.data?.state === "SUBMISSIONS_OPEN")
                  ) ||
                  (!!round.data.strictCodes && !round.data.verified)
                }
              >
                {busy ? t("Recording your vote…") : t("Submit Vote")}
              </button>
            )}
            {next && (
              <button
                className="secondary full"
                disabled={busy || !!pending}
                onClick={() => open(next)}
              >
                {t("Read Next Story →")}{" "}
              </button>
            )}
          </article>
        </div>
      ) : (
        <>
          <p className="intro">
            {t(
              "One story. One simple rating. Stories rotate so everyone gets a fair chance.",
            )}{" "}
          </p>
          {!list.data && !list.error && (
            <p role="status">{t("Loading stories…")}</p>
          )}
          {items.length === 0 && list.data && (
            <div className="card">
              <h2>{t("No stories here yet")}</h2>
              <p>
                {t("Check again once participants have shared their ideas.")}
              </p>
              <button onClick={list.refresh}>{t("Check for stories")}</button>
            </div>
          )}
          <div className="story-grid">
            {items.map((s) => (
              <button
                key={s.id}
                className="mini-story"
                onClick={() => open(s)}
                disabled={busy || !!pending}
              >
                <p className="eyebrow">{s.participantName}</p>
                <h2>{s.title}</h2>
                <p>{s.resultText}</p>
                <span>
                  {s.voted ? t("Vote recorded") : t("Read this story →")}
                </span>
              </button>
            ))}
          </div>
          <div className="actions">
            <button
              disabled={offset === 0 || busy || !!pending}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              {t("Previous stories")}{" "}
            </button>
            <button
              disabled={!list.data?.hasMore || busy || !!pending}
              onClick={() => setOffset(offset + 20)}
            >
              {t("More stories")}{" "}
            </button>
            <button disabled={busy} onClick={list.refresh}>
              {t("Refresh stories")}{" "}
            </button>
          </div>
        </>
      )}
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
  return (
    <section
      className={`content leaderboard-screen ${projector ? "projector" : ""}`}
    >
      <div className="page-title">
        <div>
          <p className="eyebrow">{t("The crowd meets the comedy judge")}</p>
          <h1>{data?.final ? t("Final Results") : t("Live Leaderboard")}</h1>
          <RoundStatus round={data?.round || null} />
        </div>
        <button onClick={fullscreen}>
          {projector ? t("Exit presentation") : t("Present fullscreen")}
        </button>
      </div>
      <div className="refresh-line">
        <span>
          {updated
            ? t("Last checked {time}", {
                time: updated.toLocaleTimeString(getLocale()),
              })
            : t("Loading the latest confirmed rankings…")}
        </span>
        <button onClick={refresh}>{t("Refresh now")}</button>
      </div>
      <Feedback error={error} />
      {error && data && (
        <p className="hint">
          {t("The last confirmed rankings remain visible.")}
        </p>
      )}
      <p className="hint">
        {t(
          "50% AI + 50% public average. Public votes required for award eligibility: {count}. Ties: public score, AI score, vote count, then story ID.",
          { count: data?.round.minVotes || 5 },
        )}
      </p>
      {data && (
        <>
          <div className="podium">
            {data.entries.slice(0, 3).map((e, i) => (
              <article
                key={e.submissionId}
                className={`podium-card place-${i + 1}`}
              >
                <span className="medal">{["01", "02", "03"][i]}</span>
                <p>{e.eligible ? t("Award eligible") : t("Provisional")}</p>
                <h2>{e.participantName}</h2>
                <p>{e.title}</p>
                <strong>
                  {score(e.finalScore)}
                  <small> / 5</small>
                </strong>
                <div className="score-detail">
                  {t("AI {ai} · Public {public} · {count} votes", {
                    ai: score(e.aiScore),
                    public: score(e.averageScore),
                    count: e.voteCount,
                  })}
                </div>
              </article>
            ))}
          </div>
          <div
            className="rankings"
            role="table"
            aria-label={t("Competition rankings")}
          >
            <div className="rank-row table-heading" role="row">
              <span role="columnheader">{t("Rank / Participant")}</span>
              <span role="columnheader">{t("AI")}</span>
              <span role="columnheader" aria-label={t("Public")}>
                {getLanguage() === "zh" ? t("Public short") : t("Public")}
              </span>
              <span role="columnheader">{t("Total")}</span>
              <span role="columnheader">{t("Votes")}</span>
            </div>
            {data.entries.map((e, i) => (
              <div className="rank-row" key={e.submissionId} role="row">
                <div role="cell">
                  <b className="rank-number">{i + 1}</b>
                  <span>
                    <strong>{e.participantName}</strong>
                    <small>
                      {e.title} ·{" "}
                      {e.eligible
                        ? t("Award eligible")
                        : e.aiScore == null
                          ? t("AI judging {status}", {
                              status: t(e.judgingStatus),
                            })
                          : t("Provisional")}
                    </small>
                  </span>
                </div>
                <span role="cell">{score(e.aiScore)}</span>
                <span role="cell">{score(e.averageScore)}</span>
                <strong role="cell">{score(e.finalScore)}</strong>
                <span role="cell">{e.voteCount}</span>
              </div>
            ))}
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
    [boothMode, setBoothMode] = useState(false),
    [allowSelfVotes, setAllowSelfVotes] = useState(true);
  async function load() {
    const result = await api<AdminData>("/api/admin/competition");
    setData(result);
    setMinVotes(result.round.minVotes);
    setStrict(!!result.round.strictCodes);
    setBoothMode(!!result.round.boothMode);
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
          <h2>{t("Round controls")}</h2>
          <p>
            {t(
              "Changes are checked by the database. Published results remain fixed.",
            )}{" "}
          </p>
          <div className="actions">
            {data?.transitions.map((state) => (
              <button
                key={state}
                disabled={busy}
                className="primary"
                onClick={() =>
                  action(
                    "transition",
                    { state },
                    state === "RESULTS"
                      ? t(
                          "Publish final rankings? Voting will close and results become immutable.",
                        )
                      : t("Change the round to {state}?", {
                          state: t(labels[state]),
                        }),
                  )
                }
              >
                {
                  {
                    SUBMISSIONS_OPEN: t("Start / Open submissions"),
                    SUBMISSIONS_CLOSED:
                      data?.round.state === "VOTING"
                        ? t("Close voting")
                        : t("Close submissions"),
                    VOTING: t("Open public voting"),
                    RESULTS: t("Close voting & Publish results"),
                    WAITING: t("Wait"),
                  }[state]
                }
              </button>
            ))}
            {data?.round.state === "RESULTS" && (
              <button
                disabled={busy}
                onClick={() => {
                  const title = window.prompt(
                    t("Title for the new round"),
                    t("Prompt Olympics"),
                  );
                  if (title)
                    void action(
                      "new-round",
                      { title },
                      t(
                        "Create a new round? All historical results are retained.",
                      ),
                    );
                }}
              >
                {t("Create a new round")}{" "}
              </button>
            )}
          </div>
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
              checked={boothMode}
              onChange={(e) => setBoothMode(e.target.checked)}
            />
            {t("Booth mode: allow voting while story creation is open")}
          </label>
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
            disabled={
              busy ||
              data?.round.state === "RESULTS" ||
              data?.round.state === "VOTING"
            }
            onClick={() =>
              action(
                "settings",
                { minVotes, strictCodes: strict, boothMode, allowSelfVotes },
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
