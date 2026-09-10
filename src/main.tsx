import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Theme = {
  id: string; title: string; premise: string; icon: string;
  difficulty: string; subjects: string[]; bonuses: string[];
};

type Story = {
  id: string; author: string; theme: Theme; prompt: string;
  title: string; text: string; promptPower: number;
  ai: { humour:number; creativity:number; surprise:number; promptQuality:number; fit:number; overall:number; commentary:string };
  votes: Vote[];
  createdAt: number;
};

type Vote = { voter:string; funny:number; creative:number; surprise:number; fit:number };

type CompetitionState = "OPEN" | "WAITING" | "SUBMISSIONS_OPEN" | "SUBMISSIONS_CLOSED" | "VOTING" | "RESULTS";

type AiScore = { funny: number; creativity: number; relevance: number; overall: number };

type SubmissionRecord = {
  participantSession?: string;
  id: string;
  participantName: string;
  prompt: string;
  resultText: string;
  title?: string;
  theme?: string;
  aiScore?: AiScore;
  createdAt: number;
  roundId?: string;
};

type VoteRecord = {
  id: string;
  submissionId: string;
  voterSession: string;
  overall: number;
  ratings?: {
    funniest?: number;
    mostCreative?: number;
    bestPrompt?: number;
    overall?: number;
  };
};

type LeaderboardEntry = {
  submissionId: string;
  participantName: string;
  prompt: string;
  resultText: string;
  title?: string;
  theme?: string;
  aiScore: AiScore;
  averageScore: number;
  voteCount: number;
  finalScore: number;
  scoreMax: number;
  createdAt: number;
};

type CompetitionRound = {
  id: string;
  title: string;
  roundNumber: number;
  state: CompetitionState;
  submissions: SubmissionRecord[];
  votes: VoteRecord[];
  leaderboard: LeaderboardEntry[];
};

type CompetitionResponse = {
  ok: boolean;
  state: CompetitionState;
  competition: {
    currentRound: CompetitionRound;
    rounds?: Array<{ id:string; title:string; roundNumber:number; state:CompetitionState; submissions:SubmissionRecord[]; votes:VoteRecord[]; }>;
  };
};

const defaultTheme: Theme = {id:"story",title:"Creative Story",premise:"Write a funny story based on the user's idea.",icon:"✨",difficulty:"Easy",subjects:["story","funny","creative"],bonuses:["🎭 a twist"]};

const themes: Theme[] = [defaultTheme];

const nickAdjectives = ["Captain","Mighty","Sneaky","Sparkly","Chaotic","Brave","Witty","Turbo","Legendary","Happy"];
const nickNouns = ["Prompt","Penguin","Ninja","Potato","Wizard","Koala","Comedian","Dragon","Banana","Olympian"];

const fragments: Record<string,string> = {
  Audience:" Make it suitable for all ages.",
  Context:" Set the story in a surprising everyday situation.",
  Specificity:" Add three concrete, funny details.",
  Constraints:" Keep it under 200 words and give it a happy ending.",
  "Output format":" Write it as a short comedy story with a punchline.",
  Creativity:" Include an unexpected twist.",
  Humour:" Make it playful, absurd and funny."
};

const scoreCategories = [
  ["Goal",18,/\b(write|create|make|tell|generate|story|comedy)\b/i],
  ["Audience",12,/\b(kids|children|everyone|family|seniors|people|coworkers|public)\b/i],
  ["Context",12,/\b(in|at|during|while|because|occasion|setting|restaurant|office|home|station)\b/i],
  ["Specificity",18,/\b(red|blue|green|yellow|purple|tiny|huge|old|young|grumpy|confident|wearing|silly|three|two|one)\b/i],
  ["Constraints",8,/\b(under|less than|maximum|no sad|happy ending|words|limit)\b/i],
  ["Output format",8,/\b(story|ending|punchline|paragraph|diary|news|dialogue)\b/i],
  ["Creativity",12,/\b(twist|unexpected|strange|absurd|unusual|surprise|magical|ridiculous)\b/i],
  ["Humour",12,/\b(funny|funniest|silly|joke|pun|absurd|hilarious|comedy|laugh)\b/i]
] as const;

const defaultRatings = { funniest: 0, mostCreative: 0, bestPrompt: 0, overall: 0 };

function randomNick() {
  return `${nickAdjectives[Math.floor(Math.random()*nickAdjectives.length)]} ${nickNouns[Math.floor(Math.random()*nickNouns.length)]}`;
}
function uid() { return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function wordCount(s:string) { return s.trim() ? s.trim().split(/\s+/).length : 0; }

function promptAnalysis(prompt:string) {
  const maxBy = Object.fromEntries(scoreCategories.map(([n,m])=>[n,m])) as Record<string,number>;
  const vals: Record<string,number> = {};
  let total=0;
  for (const [name,max,re] of scoreCategories) {
    const hits = prompt.match(new RegExp(re.source, "gi"))?.length ?? 0;
    const val = Math.min(max, hits * Math.max(1, Math.round(max/2)));
    vals[name]=val; total+=val;
  }
  if (/\b(twist|unexpected|surprise)\b/i.test(prompt)) vals.Creativity=Math.min(12, vals.Creativity+4);
  total = Math.min(100,total);
  return {total, vals, maxBy};
}

function extractName(prompt:string) {
   const match = prompt.match(/\b[A-Z][a-z]{2,15}\b/);
   return match?.[0] ?? ["Mabel","Doreen","Reginald","Chip","Alicia","Benny"][Math.floor(Math.random()*6)];
}

function buildStory(theme:Theme, prompt: string, text: string) {
  const pa = promptAnalysis(prompt);
  const name = extractName(prompt);

  const humour = Math.min(
    10,
    5 +
    (pa.vals.Humour / 12 * 2) +
    (/\b(funny|joke|absurd|silly)\b/i.test(prompt) ? 1 : 0)
  );

  const creativity = Math.min(
    10,
    4 +
    (pa.vals.Creativity / 12 * 3) +
    (/\b(twist|unexpected|surprise)\b/i.test(prompt) ? 1.5 : 0)
  );

  const surprise = Math.min(
    10,
    4 +
    (/\b(twist|unexpected|surprise)\b/i.test(prompt) ? 3 : 1) +
    (Math.random() * 1.5)
  );

  const promptQuality = Math.min(10, 3 + pa.total / 100 * 7);

  const fit = Math.min(
    10,
    3 +
      theme.subjects.filter(x =>
        prompt.toLowerCase().includes(x.toLowerCase())
      ).length /
      Math.max(1, theme.subjects.length) *
      7
  );

  const overall = Math.max(
    0,
    Math.min(
      10,
      humour * 0.35 +
      creativity * 0.20 +
      surprise * 0.15 +
      promptQuality * 0.20 +
      fit * 0.10
    )
  );

  let commentary = "";
  if (overall >= 9) {
    commentary = "The AI judge has concerns. Mainly because it is laughing too hard to continue.";
  } else if (overall >= 8) {
    commentary = "Strong comedy. The situation escalated beautifully.";
  } else if (overall >= 7) {
    commentary = "Pretty solid. The AI judge reluctantly approves.";
  } else if (overall >= 5) {
    commentary = "A decent attempt. The comedy department requests more chaos.";
  } else {
    commentary = "The story survived. The jokes are still under investigation.";
  }

  return {
    title: `The Great Tale of ${name} and ${theme.title}`,
    text,
    promptPower: pa.total,
    ai: {
      humour,
      creativity,
      surprise,
      promptQuality,
      fit,
      overall,
      commentary
    }
  };
}

function sanitizeStoredStories(value: unknown): Story[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    const story = item as Partial<Story>;
    const theme = story.theme && typeof story.theme === "object"
      ? { ...defaultTheme, ...story.theme }
      : defaultTheme;
    const ai = story.ai && typeof story.ai === "object"
      ? {
          humour: typeof story.ai.humour === "number" ? story.ai.humour : 0,
          creativity: typeof story.ai.creativity === "number" ? story.ai.creativity : 0,
          surprise: typeof story.ai.surprise === "number" ? story.ai.surprise : 0,
          promptQuality: typeof story.ai.promptQuality === "number" ? story.ai.promptQuality : 0,
          fit: typeof story.ai.fit === "number" ? story.ai.fit : 0,
          overall: typeof story.ai.overall === "number" ? story.ai.overall : 0,
          commentary: typeof story.ai.commentary === "string" ? story.ai.commentary : ""
        }
      : { humour:0, creativity:0, surprise:0, promptQuality:0, fit:0, overall:0, commentary:"" };

    const votes = Array.isArray(story.votes) ? story.votes.filter((vote): vote is Vote => !!vote && typeof vote === "object" && typeof vote.voter === "string") : [];

    const safeStory: Story = {
      id: typeof story.id === "string" ? story.id : uid(),
      author: typeof story.author === "string" ? story.author : "Anonymous",
      theme,
      prompt: typeof story.prompt === "string" ? story.prompt : "",
      title: typeof story.title === "string" ? story.title : "Untitled story",
      text: typeof story.text === "string" ? story.text : "",
      promptPower: typeof story.promptPower === "number" ? story.promptPower : 0,
      ai,
      votes,
      createdAt: typeof story.createdAt === "number" ? story.createdAt : Date.now(),
    };

    return safeStory.prompt && safeStory.text ? [safeStory] : [];
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Request failed.");
  }
  return payload as T;
}

function storedVoterId() {
  try {
    const saved = localStorage.getItem("po-voter-id");
    if (saved) return saved;
    const id = globalThis.crypto?.randomUUID?.() ?? uid();
    localStorage.setItem("po-voter-id", id);
    return id;
  } catch {
    return uid();
  }
}

function App() {
  const [page,setPage]=useState<"home"|"play"|"gallery"|"leaderboard"|"voting">("home");
  const [step,setStep]=useState<"nickname"|"prompt"|"generate"|"story">("nickname");
  const [nickname,setNickname]=useState(randomNick());
  const [theme,setTheme]=useState(defaultTheme);
  const [prompt,setPrompt]=useState("");
  const [story,setStory]=useState<Story|null>(null);
  const storyRef=useRef<Story|null>(null);
  const [loading,setLoading]=useState("🤖 AI is warming up…");
  const [generationError,setGenerationError]=useState("");
  const [isGenerating,setIsGenerating]=useState(false);
  const [largeText,setLargeText]=useState(false);
  const [highContrast,setHighContrast]=useState(false);
  const [reduced,setReduced]=useState(false);
  const [sound,setSound]=useState(true);
  const [competitionLoading, setCompetitionLoading] = useState(true);
  const [competitionError, setCompetitionError] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submissionError, setSubmissionError] = useState("");
  const [competition,setCompetition]=useState<CompetitionResponse | null>(null);
  const [voteSessionId]=useState(storedVoterId);
  const [voteName,setVoteName]=useState("");
  const voteDrafts = useRef<Record<string, typeof defaultRatings>>({});
  const [voteRatings,setVoteRatings]=useState(defaultRatings);
  const [voteError,setVoteError]=useState("");
  const [voteSuccess,setVoteSuccess]=useState("");
  const [isSubmittingVote,setIsSubmittingVote]=useState(false);
  const [selectedSubmissionId,setSelectedSubmissionId]=useState<string|null>(null);

  const competitionState = competition?.state ?? "WAITING";
  const currentRound = competition?.competition?.currentRound ?? null;

  useEffect(() => {
    void loadCompetition();
  }, []);

  async function loadCompetition() {
    setCompetitionLoading(true);
    setCompetitionError("");
    try {
      const result = await fetchJson<CompetitionResponse>("/api/competition");
      setCompetition(result);
    } catch (error) {
      setCompetitionError(error instanceof Error ? error.message : "Could not load the competition.");
    } finally {
      setCompetitionLoading(false);
    }
  }

  const currentCandidate = (currentRound?.submissions ?? []).find((submission) => submission.id === selectedSubmissionId) ?? null;

  const votedIds = new Set((currentRound?.votes ?? [])
    .filter(vote => vote.voterSession.toLowerCase() === voteSessionId.toLowerCase())
    .map(vote => vote.submissionId));
  const existingVote = currentRound?.votes.find(vote =>
    vote.submissionId === selectedSubmissionId && vote.voterSession.toLowerCase() === voteSessionId.toLowerCase());

  function openEntry(submissionId: string) {
    if (selectedSubmissionId && !existingVote) voteDrafts.current[selectedSubmissionId] = voteRatings;
    setSelectedSubmissionId(submissionId);
    setVoteRatings(voteDrafts.current[submissionId] ?? defaultRatings);
    setVoteError("");
    setVoteSuccess("");
    setPage("voting");
  }
  const activeStory=story ?? storyRef.current;

  function startPlay() {
    setSubmissionStatus("idle"); setSubmissionError("");
    storyRef.current=null; setNickname(randomNick()); setTheme(defaultTheme); setPrompt(""); setStory(null); setGenerationError(""); setStep("nickname"); setPage("play");
  }

  async function generate(regenerate=false) {
    if(!prompt.trim() || isGenerating) return;
    setSubmissionStatus("idle");
    setSubmissionError("");
    setIsGenerating(true);
    setGenerationError("");
    setStep("generate");
    const messages=["🤖 AI is warming up…","😂 Searching for comedy…","💥 Preparing the plot twist…","🧠 Translating your genius…"];
    let i=0; setLoading(messages[0]);
    const timer=setInterval(()=>{i++;setLoading(messages[i%messages.length]);},2400);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, theme: `${theme.title}: ${theme.premise}`, regenerate, previousStory: regenerate ? activeStory?.text : undefined }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.text !== "string") {
        throw new Error(payload.error || "The story AI could not generate a story. Please try again.");
      }
      clearInterval(timer); window.clearTimeout(timeout);
      const g=buildStory(theme,prompt,payload.text.trim());
      const aiTitle = typeof payload.title === "string" ? payload.title.trim() : "";
      const title = aiTitle || g.title;
      const submissionStory:Story={
        id: regenerate && activeStory ? activeStory.id : uid(),
        author:nickname.trim(),
        theme,
        prompt,
        title,
        text:g.text,
        promptPower:g.promptPower,
        ai:g.ai,
        votes:[],
        createdAt:Date.now()
      };
      storyRef.current=submissionStory;
      setStory(submissionStory);
      setStep("story");

      setSubmissionStatus("saving");
      try {
        const saved = await fetchJson<{ ok: boolean; submission: SubmissionRecord; round: CompetitionRound }>("/api/submissions", {
          method: "POST",
          body: JSON.stringify({ participantName: submissionStory.author, prompt: submissionStory.prompt,
            resultText: submissionStory.text, title, theme: theme.title, participantSession: voteSessionId })
        });
        if (!saved.ok || !saved.submission || !saved.round) throw new Error("The server did not confirm your entry.");
        const confirmedStory = { ...submissionStory, id: saved.submission.id };
        storyRef.current = confirmedStory;
        setStory(confirmedStory);
        setCompetition({ ok: true, state: saved.round.state, competition: { currentRound: saved.round } });
        setCompetitionError("");
        setSubmissionStatus("saved");
      } catch (error) {
        setSubmissionStatus("error");
        setSubmissionError(error instanceof Error ? error.message : "Your entry could not be confirmed.");
      }
    } catch (error) {
      clearInterval(timer); window.clearTimeout(timeout);
      setGenerationError(error instanceof DOMException && error.name === "AbortError" ? "The story AI took too long to reply. Please try again." : error instanceof Error ? error.message : "The story AI could not generate a story. Please try again.");
      setStep(regenerate ? "story" : "prompt");
    } finally {
      setIsGenerating(false);
    }
  }

  const shellClass=`app ${largeText?"large-text":""} ${highContrast?"contrast":""} ${reduced?"reduced":""}`;
  const nav=(p:typeof page)=>{if (isSubmittingVote) return; setPage(p); if(p==="play")startPlay();};

  async function handleVoteSubmit() {
    if (isSubmittingVote || existingVote) return;
    if (!currentCandidate) {
      setVoteError("Pick an entry from the gallery first.");
      return;
    }
    if (!voteRatings.overall) {
      setVoteError("Please choose a 1–5 Overall rating before submitting.");
      return;
    }
    if (isOwnEntry(currentCandidate)) {
      setVoteError("You cannot vote for your own submission.");
      return;
    }

    setIsSubmittingVote(true);
    setVoteError("");
    setVoteSuccess("");
    try {
      const result = await fetchJson<{ ok: boolean; round: CompetitionRound }>("/api/votes", {
        method: "POST",
        body: JSON.stringify({
          submissionId: currentCandidate.id,
          voterSession: voteSessionId,
          participantName: voteName.trim(),
          ratings: {
            funniest: voteRatings.funniest,
            mostCreative: voteRatings.mostCreative,
            bestPrompt: voteRatings.bestPrompt,
            overall: voteRatings.overall,
            overallScore: voteRatings.overall
          }
        })
      });
      if (!result.ok || !result.round) throw new Error("Your vote was not confirmed. Please refresh the competition before trying again.");
      delete voteDrafts.current[currentCandidate.id];
      // Use the round returned by the vote itself so the leaderboard updates instantly, without a second fetch.
      if (result.round) {
        setCompetition((prev) => prev ? { ...prev, competition: { ...prev.competition, currentRound: result.round } } : prev);
      }
      setVoteSuccess(`Vote recorded: ${voteRatings.overall} of 5 overall. Thank you for taking part!`);
      setVoteRatings(defaultRatings);
    } catch (error) {
      setVoteError(error instanceof Error ? error.message : "The vote could not be saved. Please try again.");
    } finally {
      setIsSubmittingVote(false);
    }
  }

  const leaderboard = currentRound?.leaderboard ?? [];
  const listState = { loading: competitionLoading, error: competitionError, onRetry: loadCompetition, onCreate: startPlay };
  function isOwnEntry(entry: SubmissionRecord) {
    return entry.participantSession === voteSessionId ||
      (!!voteName.trim() && entry.participantName.toLowerCase() === voteName.trim().toLowerCase());
  }
  const eligibleEntries = (currentRound?.submissions ?? []).filter(entry => !isOwnEntry(entry));
  const remainingEntries = eligibleEntries.filter(entry => !votedIds.has(entry.id));
  const nextEntry = remainingEntries.find(entry => entry.id !== selectedSubmissionId);
  const ownEntry = currentCandidate ? isOwnEntry(currentCandidate) : false;

  return <div className={shellClass}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="topbar">
      <button className="brand" onClick={()=>nav("home")}><span className="brand-mark">✨</span><span>Prompt <b>Olympics</b></span></button>
      <nav aria-label="Main navigation">{(["home","play","gallery","leaderboard","voting"] as const).map(p=><button disabled={isSubmittingVote} aria-current={page===p?"page":undefined} className={page===p?"active":""} onClick={()=>nav(p)} key={p}>{p==="home"?"Home":p === "voting" ? "Voting" : p[0].toUpperCase()+p.slice(1)}</button>)}</nav>
      <a className="tiny admin-link" href="/admin">⚙️ Admin</a>
    </header>

    {page === "home" && <main id="main-content" tabIndex={-1} className="home">
      <section className="hero">
        <div className="eyebrow">🏁 LIVE COMPETITION</div>
        <h1>Prompt <span>Olympics</span></h1>
        <p className="hero-description">Turn a creative prompt into a funny story. Share your imagination and vote for your favorites.</p>
        <p className="round-label">{currentRound ? `Round ${currentRound.roundNumber}: ${currentRound.title}` : "Round 1"}</p>
        <div className="hero-actions">
          <button className="primary" onClick={startPlay}>🚀 Join the challenge</button>
          <button className="secondary" onClick={()=>setPage("gallery")}>⭐ Choose an entry to vote</button>
          {competitionState === "RESULTS" && <button className="primary" onClick={()=>setPage("leaderboard")}>🏆 View leaderboard</button>}
          {competitionState === "WAITING" && <button className="secondary" onClick={()=>setPage("play")}>⏳ Waiting for round start</button>}
        </div>
      </section>
      {(competitionLoading || competitionError) && <div className="home-feedback"><DataFeedback loading={competitionLoading} error={competitionError} onRetry={loadCompetition} /></div>}
      <section className="podium">
        <div><span>🏟️</span><div><small>ROUND</small><strong>{currentRound?.roundNumber ?? "—"}</strong></div></div>
        <div><span>📊</span><div><small>STATE</small><strong>{currentRound ? competitionState.toLowerCase().replace(/_/g, " ") : "—"}</strong></div></div>
        <div><span>🏆</span><div><small>SUBMISSIONS</small><strong>{currentRound?.submissions.length ?? "—"}</strong></div></div>
      </section>
      <section className="how-it-works" aria-labelledby="how-it-works-title">
        <div className="section-heading"><h2 id="how-it-works-title">A little imagination. A friendly competition.</h2><p>Three simple steps to take part.</p></div>
        <ol className="steps-grid">
          {[
            ["01", "Make it yours", "Choose a nickname and write your story idea. The prompt coach can help you refine it."],
            ["02", "Bring it to life", "Generate an AI story from your prompt and share it with the competition."],
            ["03", "Find your favorites", "Explore the gallery, rate the entries, and see who climbs the leaderboard."]
          ].map(([number, title, description]) => <li key={number}><span className="step-number" aria-hidden="true">{number}</span><h3>{title}</h3><p>{description}</p></li>)}
        </ol>
      </section>
    </main>}

    {page === "play" && <main id="main-content" tabIndex={-1} className="game">
      <div className="progress"><span>PLAY</span><div><i style={{width:`${({nickname:25,prompt:50,generate:85,story:100} as Record<string,number>)[step]}%`}}/></div><span>{step.toUpperCase()}</span></div>
      {step === "nickname" && <Card icon="👋" title="Choose a nickname" sub="Pick a name to enter the competition."><label className="field-label" htmlFor="nickname">Your nickname</label><div className="nickbox"><input id="nickname" autoComplete="nickname" value={nickname} maxLength={24} onChange={e=>setNickname(e.target.value)}/><button onClick={()=>setNickname(randomNick())}>🎲 Surprise me</button></div><button className="primary full" disabled={!nickname.trim()} onClick={()=>setStep("prompt")}>Continue →</button></Card>}
      {step === "prompt" && <PromptScreen prompt={prompt} setPrompt={setPrompt} onGenerate={generate} error={generationError} isGenerating={isGenerating}/>}

      {step === "generate" && <Card icon="🤖" title={loading} sub="Your idea is being turned into a story…"><div className="loader" role="status" aria-live="polite"><div>🏃</div><p>Writing your story…</p></div></Card>}
      {step === "story" && activeStory && <StoryCard story={activeStory} onRegenerate={()=>generate(true)} onBackToPrompt={()=>setStep("prompt")} error={generationError} status={submissionStatus} saveError={submissionError} busy={isGenerating} onView={()=>openEntry(activeStory.id)} onBrowse={()=>setPage("gallery")}/>}
      {step === "story" && !activeStory && <Card icon="⚠️" title="Your story did not load" sub="Gemini did not return a story this time. Your prompt is still saved."><button className="primary full" onClick={()=>setStep("prompt")}>← Back to my prompt</button></Card>}
    </main>}

    {page === "gallery" && <Gallery entries={leaderboard} onOpen={openEntry} votedIds={votedIds} {...listState} />}
    {page === "leaderboard" && <Leaderboard entries={leaderboard} {...listState} />}

    {page === "voting" && (
      <main id="main-content" tabIndex={-1} className="content voting-screen">
        <div className="page-title compact">
          <div>
            <span>⭐ VOTING MODE</span>
            <h1>{selectedSubmissionId ? "Rate this entry." : "Rate the entries."}</h1>
          </div>
          {selectedSubmissionId && <button disabled={isSubmittingVote} className="secondary" onClick={() => { setSelectedSubmissionId(null); setPage("gallery"); }}>← Back to gallery</button>}
        </div>

        {!competitionLoading && !competitionError && <div className="voting-progress">
          <div><strong>{eligibleEntries.length - remainingEntries.length} of {eligibleEntries.length} entries rated</strong><span>{remainingEntries.length ? `${remainingEntries.length} left to explore` : "You’re all caught up!"}</span></div>
          <progress aria-label="Your voting progress" value={eligibleEntries.length - remainingEntries.length} max={Math.max(1, eligibleEntries.length)}/>
          <button className="secondary" onClick={loadCompetition} disabled={isSubmittingVote}>Refresh entries</button>
        </div>}
        {competitionLoading || competitionError ? <DataFeedback loading={competitionLoading} error={competitionError} onRetry={loadCompetition} /> : !currentCandidate ? (
          <section className="card centered voting-empty">
            <div className="bigicon">🗳️</div>
            <h2>Pick an entry to vote on.</h2>
            <p className="sub">Open any result from the gallery and rate it from there — no need to go through every entry.</p>
            {nextEntry && <button className="primary full" onClick={()=>openEntry(nextEntry.id)}>Start rating →</button>}
            <button className="secondary full" onClick={() => setPage("gallery")}>📖 Browse gallery</button>
          </section>
        ) : (
          <section className="card voting-card">
            <div className="vote-header">
              <div>
                <small>Current voter</small>
                <h3>{voteName.trim() || "You"}</h3>
              </div>
              <div>
                <small>Entry theme</small>
                <h3>{currentCandidate.theme || "Creative Story"}</h3>
              </div>
            </div>

            <details className="voter-box">
              <summary>Your name (optional)</summary>
              <label htmlFor="voter-name">Participant name</label>
              <input disabled={isSubmittingVote} id="voter-name" value={voteName} onChange={(e)=>setVoteName(e.target.value)} maxLength={40} placeholder="Enter your participant name" />
              <p className="rating-hint">Your vote is linked to this browser, so a name change cannot create another vote.</p>
            </details>

            <div className="submission-panel">
              <div className="submission-meta">
                <span>Prompt Olympics Result</span>
                <strong>{currentCandidate.participantName}</strong>
              </div>
              <details className="entry-prompt" open><summary>Original prompt</summary><p>{currentCandidate.prompt}</p></details>
              <h2>{currentCandidate.title ?? "Prompt Olympics Result"}</h2>
              <p>{currentCandidate.resultText}</p>
              {currentCandidate.aiScore && (
                <details className="ai-score">
                  <summary>View AI scores · out of 10</summary>
                  <div className="chips">
                    <span>😂 Funny {currentCandidate.aiScore.funny.toFixed(1)}</span>
                    <span>💡 Creativity {currentCandidate.aiScore.creativity.toFixed(1)}</span>
                    <span>🎯 Relevance {currentCandidate.aiScore.relevance.toFixed(1)}</span>
                    <span>⭐ Overall {currentCandidate.aiScore.overall.toFixed(1)}</span>
                  </div>
                </details>
              )}
            </div>

            {ownEntry && <p className="feedback">This is your entry. You can read it, but you cannot vote for it.</p>}
            {existingVote && <div className="feedback success" role="status"><strong>Already voted · {existingVote.overall} of 5 overall</strong><p>Your rating is recorded for this voter session.</p></div>}
            <fieldset className="rating-area" disabled={isSubmittingVote || !!existingVote || ownEntry}><legend className="sr-only">Entry ratings</legend><p className="rating-hint">How was it? Choose one Overall rating to submit.</p>
              {[ ["⭐ Overall", "overall"] ].map(([label, key]) => {
                const rating = existingVote
                  ? existingVote.ratings?.[key as keyof typeof defaultRatings] ?? (key === "overall" ? existingVote.overall : 0)
                  : voteRatings[key as keyof typeof voteRatings];
                return (
                <div className="rating-row" key={key}>
                  <div className="rating-label">{label}<small>{rating ? `${rating} of 5` : "Not rated"}</small></div>
                  <div className="star-row" role="group" aria-label={`${label} rating`}>
                    {[1,2,3,4,5].map(value => <label className={`star-choice ${rating >= value ? "selected" : ""}`} key={value}>
                      <input type="radio" name={`rating-${key}`} value={value} checked={rating === value}
                        aria-label={`${label}: ${value} of 5`} onChange={()=>setVoteRatings(prev=>({...prev, [key]:value}))}/>
                      <span aria-hidden="true">{rating >= value ? "★" : "☆"}</span>
                    </label>)}
                    {key !== "overall" && rating > 0 && !existingVote && <button className="clear-rating" type="button" aria-label={`Clear ${label} rating`} onClick={()=>setVoteRatings(prev=>({...prev,[key]:0}))}>Clear</button>}
                  </div>
                </div>
                );
              })}
              <details className="optional-ratings">
                <summary>Rate more (optional)</summary>
                {[ ["😂 Funniest", "funniest"], ["💡 Most Creative", "mostCreative"], ["✨ Best Prompt", "bestPrompt"] ].map(([label, key]) => {
                  const rating = existingVote?.ratings?.[key as keyof typeof defaultRatings] ?? voteRatings[key as keyof typeof voteRatings];
                  return (
                  <div className="rating-row" key={key}>
                    <div className="rating-label">{label}<small>{rating ? `${rating} of 5` : "Not rated"}</small></div>
                    <div className="star-row" role="group" aria-label={`${label} rating`}>
                      {[1,2,3,4,5].map(value => <label className={`star-choice ${rating >= value ? "selected" : ""}`} key={value}>
                        <input type="radio" name={`rating-${key}`} value={value} checked={rating === value}
                          aria-label={`${label}: ${value} of 5`} onChange={()=>setVoteRatings(prev=>({...prev, [key]:value}))}/>
                        <span aria-hidden="true">{rating >= value ? "★" : "☆"}</span>
                      </label>)}
                      {rating > 0 && !existingVote && <button className="clear-rating" type="button" aria-label={`Clear ${label} rating`} onClick={()=>setVoteRatings(prev=>({...prev,[key]:0}))}>Clear</button>}
                    </div>
                  </div>
                  );
                })}
              </details>
            </fieldset>

            {voteError && <p className="generation-error" role="alert">⚠️ {voteError}</p>}
            {voteSuccess && <p className="vote-success" role="status">✅ {voteSuccess}</p>}

            <div className="row voting-actions">
              <button className="secondary" disabled={isSubmittingVote || !!existingVote || ownEntry} onClick={() => { setVoteError(""); setVoteRatings(defaultRatings); }} type="button">Reset</button>
              <button className="primary" disabled={isSubmittingVote || !!existingVote || ownEntry || !voteRatings.overall} onClick={handleVoteSubmit} type="button">{isSubmittingVote ? "Saving…" : existingVote ? "Vote recorded" : "Submit my vote"}</button>
            </div>
            <div className="row next-actions">
              {nextEntry && <button className="primary" disabled={isSubmittingVote} onClick={()=>openEntry(nextEntry.id)}>{existingVote || ownEntry ? "Rate another entry →" : "Skip for now →"}</button>}
              <button className="secondary" disabled={isSubmittingVote} onClick={()=>setPage("gallery")}>Browse gallery</button>
              <button className="secondary" disabled={isSubmittingVote} onClick={()=>setPage("leaderboard")}>View leaderboard</button>
            </div>
          </section>
        )}
      </main>
    )}
  </div>
}

function Card({icon,title,sub,children}:{icon:string,title:string,sub:string,children:React.ReactNode}) {
  return <section className="card centered"><div className="bigicon">{icon}</div><h2>{title}</h2><p className="sub">{sub}</p>{children}</section>
}
function PromptCoach({prompt, setPrompt, disabled}: {prompt: string; setPrompt: (value: string) => void; disabled: boolean}) {
  const analysis = useMemo(() => promptAnalysis(prompt), [prompt]);
  const suggestions = Object.keys(fragments).filter(key => !prompt.includes(fragments[key].trim()))
    .sort((a, b) => analysis.vals[a] / analysis.maxBy[a] - analysis.vals[b] / analysis.maxBy[b]).slice(0, 3);
  return <aside className="inline-coach" aria-labelledby="coach-heading">
    <h3 id="coach-heading">✨ Prompt coach <span>Optional</span></h3>
    <p>Choose a suggestion to add it to your prompt. You can edit or remove the added text.</p>
    <div className="coach">{suggestions.map(key => <button key={key} type="button"
      disabled={disabled || prompt.length + fragments[key].length > 700}
      onClick={() => setPrompt(prompt + fragments[key])}>Add {key.toLowerCase()}<small>{fragments[key].trim()}</small></button>)}</div>
    {suggestions.some(key => prompt.length + fragments[key].length > 700) && <p>Shorten your prompt to make room for disabled suggestions.</p>}
    {!suggestions.length && <p>All suggestions added. Make any final edits above.</p>}
  </aside>;
}

function PromptScreen({prompt,setPrompt,onGenerate,error,isGenerating}:{prompt:string,setPrompt:(s:string)=>void,onGenerate:()=>void,error:string,isGenerating:boolean}) {
  return <section className="card prompt-screen">
    <h2>What should happen?</h2><p className="sub">Describe your story idea clearly and keep the main premise in focus.</p>
    <label className="field-label" htmlFor="story-prompt">Your story prompt</label>
    <div className="prompt-wrap"><textarea id="story-prompt" aria-describedby="prompt-count" value={prompt} disabled={isGenerating}
      onChange={e=>setPrompt(e.target.value)} maxLength={700} placeholder="Example: A robot attends a family dinner and takes everything literally."/>
      <span id="prompt-count">{prompt.length} / 700 characters</span></div>
    <PromptCoach prompt={prompt} setPrompt={setPrompt} disabled={isGenerating}/>
    {error && <p className="generation-error" role="alert">⚠️ {error}</p>}
    <p className="rating-hint">Generating a story automatically enters it into the current round.</p>
    <button className="primary full" disabled={!prompt.trim() || prompt.length > 700 || isGenerating} onClick={()=>onGenerate()}>🤖 Generate and enter story</button>
  </section>;
}

function StoryCard({story,onRegenerate,onBackToPrompt,error,status,saveError,busy,onView,onBrowse}: {
  story:Story; onRegenerate:()=>void; onBackToPrompt:()=>void; error:string;
  status:"idle"|"saving"|"saved"|"error"; saveError:string; busy:boolean; onView:()=>void; onBrowse:()=>void;
}) {
  return <section className="card story-card" aria-busy={busy}>
    <div className="story-meta"><span>{story.theme.icon} {story.theme.title}</span><span>✨ Story ready</span></div>
    {status === "saving" && <div className="feedback" role="status">Your story is ready. Entering it into the competition…</div>}
    {status === "saved" && <div className="feedback success"><p role="status"><strong>Your entry is in!</strong> Your story has been entered into the competition.</p>
      <div className="row"><button className="primary" onClick={onView}>View my entry</button><button className="secondary" onClick={onBrowse}>Browse stories</button></div></div>}
    {status === "error" && <div className="feedback"><p className="generation-error" role="alert"><strong>Submission not confirmed.</strong> {saveError}</p>
      <p>Your generated story is still here. Check the gallery before generating again to avoid a duplicate entry.</p><button className="secondary" onClick={onBrowse}>Check gallery</button></div>}
    <h2>{story.title}</h2><p className="story-text">{story.text}</p>
    {error && <p className="generation-error" role="alert">⚠️ {error}</p>}
    <p className="rating-hint">Regenerating creates another entry; it does not replace a previously submitted story.</p>
    <button className="secondary full" disabled={busy} onClick={onRegenerate}>🔄 Regenerate Story</button>
    <button className="secondary full" disabled={busy} onClick={onBackToPrompt}>✍️ Write Another Story</button>
  </section>;
}

type ListStateProps = { loading: boolean; error: string; onRetry: () => void; onCreate: () => void };
function DataFeedback({loading,error,onRetry}: Omit<ListStateProps, "onCreate">) {
  if (loading) return <div className="feedback" role="status">Loading competition entries and scores…</div>;
  if (error) return <div className="feedback"><p role="alert"><strong>Couldn’t load competition data.</strong> {error}</p><button className="secondary" onClick={onRetry}>Try again</button></div>;
  return null;
}
function EmptyEntries({onCreate}: {onCreate: () => void}) {
  return <div className="empty"><div aria-hidden="true">🏆</div><h2>The competition starts with you.</h2>
    <p>No entries yet. Create a story to give everyone something to vote on.</p><button className="primary" onClick={onCreate}>Create an entry</button></div>;
}
function ScoreGuide() {
  return <details className="score-guide"><summary>How are scores calculated?</summary>
    <p>Before voting, entries are ordered by their AI score out of 10. After an entry receives public votes, its combined score is the AI score out of 10 plus the public average out of 5, for a maximum of 15.</p></details>;
}
function EntryScores({entry}: {entry: LeaderboardEntry}) {
  return <span className="entry-scores"><span>AI {entry.aiScore.overall.toFixed(1)} / 10</span>
    <span>Public {entry.voteCount ? `${entry.averageScore.toFixed(1)} / 5` : "not rated"} · {entry.voteCount} {entry.voteCount === 1 ? "vote" : "votes"}</span>
    <span className="score-equation">Combined {entry.finalScore.toFixed(1)} / {entry.scoreMax}</span></span>;
}
function Gallery({entries,onOpen,votedIds,loading,error,onRetry,onCreate}: ListStateProps & {entries:LeaderboardEntry[]; onOpen:(id:string)=>void; votedIds:Set<string>}) {
  const [sort,setSort]=useState("top");
  const sorted=sort === "latest" ? [...entries].sort((a,b)=>b.createdAt-a.createdAt) : entries;
  return <main id="main-content" tabIndex={-1} className="content">
    <div className="page-title"><div><span>📖 HALL OF FAME</span><h1>Stories worth<br/><em>remembering.</em></h1></div>
      <div className="tabs" role="group" aria-label="Sort entries">{["top","latest"].map(x=><button aria-pressed={sort===x} className={sort===x?"active":""} onClick={()=>setSort(x)} key={x}>{x === "top" ? "Top scores" : "Latest"}</button>)}</div></div>
    <DataFeedback loading={loading} error={error} onRetry={onRetry}/>
    {!loading && !error && (!sorted.length ? <EmptyEntries onCreate={onCreate}/> : <>
      <ScoreGuide/><div className="story-grid">{sorted.map(entry=><button className="mini-story" key={entry.submissionId} onClick={()=>onOpen(entry.submissionId)} type="button">
        <div><span>✨ {entry.theme || defaultTheme.title}</span><span className="final-score"><small>{entry.voteCount ? "Combined score" : "AI score"}</small><b>{entry.finalScore.toFixed(1)} / {entry.scoreMax}</b></span></div>
        <h3>{entry.title || "Prompt Olympics Result"}</h3><p>{entry.resultText}</p><small>by {entry.participantName}</small>
        <EntryScores entry={entry}/><span className="entry-action">{votedIds.has(entry.submissionId) ? "✓ Already voted · Read entry" : "Read and vote →"}</span>
      </button>)}</div></>)}
  </main>;
}
function Leaderboard({entries,loading,error,onRetry,onCreate}: ListStateProps & {entries:LeaderboardEntry[]}) {
  return <main id="main-content" tabIndex={-1} className="content"><div className="page-title"><div><span>🥇 LEADERBOARD</span><h1>Who will take<br/><em>the podium?</em></h1></div></div>
    <DataFeedback loading={loading} error={error} onRetry={onRetry}/>
    {!loading && !error && (!entries.length ? <EmptyEntries onCreate={onCreate}/> : <><ScoreGuide/><div className="leader">{entries.map((entry,i)=><div className="leader-row" key={entry.submissionId}>
      <strong aria-label={`Rank ${i+1}`}>{["🥇","🥈","🥉"][i] ?? `#${i+1}`}</strong>
      <span>{entry.participantName}<EntryScores entry={entry}/></span><span className="final-score"><small>{entry.voteCount ? "Combined score" : "AI score"}</small><b>{entry.finalScore.toFixed(1)} / {entry.scoreMax}</b></span>
    </div>)}</div></>)}
  </main>;
}

function AdminApp() {
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<CompetitionResponse | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function loadAdminData() {
    try {
      const data = await fetchJson<CompetitionResponse>("/api/admin/competition", {
        headers: { "x-admin-password": password }
      });
      setSession(data);
      setError("");
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
      setLoaded(false);
    }
  }

  async function callAdmin(url: string, method = "POST") {
    if (!password) {
      setError("Enter the admin password first.");
      return;
    }
    try {
      const data = await fetchJson<{ ok: boolean; currentRound?: CompetitionRound; message?: string; competition?: { currentRound: CompetitionRound } }>(url, {
        method,
        headers: { "x-admin-password": password }
      });
      const nextRound = data.currentRound ?? data.competition?.currentRound ?? null;
      if (nextRound) {
        const fresh = { ...session, competition: { ...(session?.competition ?? {}), currentRound: nextRound } } as CompetitionResponse;
        setSession(fresh);
      }
      setError("");
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin action failed.");
    }
  }

  const currentRound = session?.competition?.currentRound ?? null;

  return <div className="admin-shell">
    {!loaded ? (
      <main id="main-content" tabIndex={-1} className="admin-login">
        <section className="card centered admin-card">
          <div className="bigicon">🔐</div>
          <h2>Admin access</h2>
          <label className="field-label" htmlFor="admin-password">Admin password</label><input id="admin-password" autoComplete="current-password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Enter admin password" />
          {error && <p className="generation-error" role="alert">⚠️ {error}</p>}
          <div className="row">
            <a className="secondary button-link" href="/">← Back to app</a>
            <button className="primary" onClick={loadAdminData}>Unlock admin</button>
          </div>
        </section>
      </main>
    ) : (
      <main id="main-content" tabIndex={-1} className="content admin-panel">
        <div className="page-title admin-header">
          <div>
            <span>🛡️ ADMIN</span>
            <h1>Round {currentRound?.roundNumber ?? 1}</h1>
          </div>
          <div className="row small-row">
            <button className="secondary" onClick={() => window.location.href = "/"}>Back to event</button>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="card admin-card compact-card">
            <h3>Competition actions</h3>
            <button className="secondary full" onClick={() => callAdmin("/api/admin/reset-votes")}>Reset votes</button>
            <button className="secondary full" onClick={() => {
              if (window.confirm("Delete all submissions and votes for this round?")) callAdmin("/api/admin/delete-all-submissions");
            }}>Delete all submissions</button>
            <button className="secondary full" onClick={() => {
              const nextRound = window.prompt("Enter a new round name:", "Prompt Olympics");
              if (nextRound) callAdmin(`/api/admin/start-new-round`, "POST");
            }}>New round</button>
            <button className="secondary full" onClick={() => {
              if (window.confirm("Reset the entire competition and start a fresh round?")) callAdmin("/api/admin/reset-competition");
            }}>Reset competition</button>
          </div>

          <div className="card admin-card compact-card">
            <h3>Current state</h3>
            <p><strong>State:</strong> {currentRound?.state ?? "WAITING"}</p>
            <p><strong>Submissions:</strong> {currentRound?.submissions.length ?? 0}</p>
            <p><strong>Votes:</strong> {currentRound?.votes.length ?? 0}</p>
            <p><strong>Average:</strong> {currentRound?.leaderboard?.length ? currentRound.leaderboard[0].averageScore.toFixed(1) : "0.0"}</p>
            <p><strong>Tie rule:</strong> higher average, then more votes, then alphabetical participant name.</p>
          </div>
        </div>

        <div className="card admin-table">
          <h3>Submission list</h3>
          {!currentRound?.submissions.length ? <p className="sub">No submissions yet.</p> : (
            <table>
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Result</th>
                  <th>Votes</th>
                  <th>Average</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {currentRound.submissions.map((submission) => {
                  const average = currentRound.votes.filter((vote) => vote.submissionId === submission.id).length
                    ? currentRound.votes.filter((vote) => vote.submissionId === submission.id).reduce((sum, vote) => sum + Number(vote.overall ?? 0), 0) / currentRound.votes.filter((vote) => vote.submissionId === submission.id).length
                    : 0;
                  return <tr key={submission.id}>
                    <td>{submission.participantName}</td>
                    <td>{submission.resultText}</td>
                    <td>{currentRound.votes.filter((vote) => vote.submissionId === submission.id).length}</td>
                    <td>{average.toFixed(1)}</td>
                    <td><button className="secondary small-button" onClick={() => {
                      if (window.confirm(`Delete ${submission.participantName}'s submission and all its votes?`)) {
                        callAdmin(`/api/admin/delete-submission/${submission.id}`);
                      }
                    }}>Delete</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    )}
  </div>;
}

const isAdminRoute = window.location.pathname === "/admin";
createRoot(document.getElementById("root")!).render(isAdminRoute ? <AdminApp /> : <App />);
