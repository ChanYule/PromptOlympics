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

type CompetitionState = "WAITING" | "SUBMISSIONS_OPEN" | "SUBMISSIONS_CLOSED" | "VOTING" | "RESULTS";

type SubmissionRecord = {
  id: string;
  participantName: string;
  prompt: string;
  resultText: string;
  title?: string;
  theme?: string;
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

type CompetitionRound = {
  id: string;
  title: string;
  roundNumber: number;
  state: CompetitionState;
  submissions: SubmissionRecord[];
  votes: VoteRecord[];
  leaderboard: Array<{ submissionId:string; participantName:string; prompt:string; resultText:string; averageScore:number; voteCount:number; createdAt:number; }>;
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

function finalScore(s:Story) {
  if (!s.votes.length) return s.ai.overall;
  const avg=s.votes.reduce((a,v)=>a+(v.funny+v.creative+v.surprise+v.fit)/4,0)/s.votes.length;
  const human=((avg-1)/4)*10;
  return s.ai.overall*.5+human*.5;
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

function App() {
  const [page,setPage]=useState<"home"|"play"|"gallery"|"leaderboard"|"voting">("home");
  const [step,setStep]=useState<"nickname"|"prompt"|"improve"|"generate"|"story">("nickname");
  const [nickname,setNickname]=useState(randomNick());
  const [theme,setTheme]=useState(defaultTheme);
  const [prompt,setPrompt]=useState("");
  const [story,setStory]=useState<Story|null>(null);
  const storyRef=useRef<Story|null>(null);
  const [stories,setStories]=useState<Story[]>([]);
  const [loading,setLoading]=useState("🤖 AI is warming up…");
  const [generationError,setGenerationError]=useState("");
  const [isGenerating,setIsGenerating]=useState(false);
  const [largeText,setLargeText]=useState(false);
  const [highContrast,setHighContrast]=useState(false);
  const [reduced,setReduced]=useState(false);
  const [sound,setSound]=useState(true);
  const [competition,setCompetition]=useState<CompetitionResponse | null>(null);
  const [voteSessionId,setVoteSessionId]=useState("Voter 1");
  const [voteName,setVoteName]=useState("Voter 1");
  const [voteRatings,setVoteRatings]=useState(defaultRatings);
  const [voteError,setVoteError]=useState("");
  const [voteSuccess,setVoteSuccess]=useState("");
  const [isSubmittingVote,setIsSubmittingVote]=useState(false);
  const [scoredSubmissionIds,setScoredSubmissionIds]=useState<string[]>([]);
  const [voterNumber,setVoterNumber]=useState(1);

  const competitionState = competition?.state ?? "WAITING";
  const currentRound = competition?.competition?.currentRound ?? null;

  useEffect(() => {
    void loadCompetition();
  }, []);

  async function loadCompetition() {
    try {
      const result = await fetchJson<CompetitionResponse>("/api/competition");
      setCompetition(result);
      const serverStories = result.competition?.currentRound?.submissions ?? [];
      const normalizedStories = serverStories.map((item) => ({
        id: item.id,
        author: item.participantName,
        theme: { ...defaultTheme, title: item.theme ?? defaultTheme.title },
        prompt: item.prompt,
        title: item.title ?? "Prompt Olympics Result",
        text: item.resultText,
        promptPower: 0,
        ai: { humour: 0, creativity: 0, surprise: 0, promptQuality: 0, fit: 0, overall: 0, commentary: "" },
        votes: [],
        createdAt: item.createdAt,
      }));
      setStories(normalizedStories);
    } catch (error) {
      console.error("Could not load competition", error);
    }
  }

  useEffect(() => {
    if (competitionState === "VOTING") {
      setPage("voting");
    }
  }, [competitionState]);

  const availableSubmissions = (currentRound?.submissions ?? []).filter(
    (submission) => !scoredSubmissionIds.includes(submission.id)
  );
  const currentCandidate = availableSubmissions[0] ?? null;

  const analysis=useMemo(()=>promptAnalysis(prompt),[prompt]);
  const activeStory=story ?? storyRef.current;

  function startPlay() {
    storyRef.current=null; setNickname(randomNick()); setTheme(defaultTheme); setPrompt(""); setStory(null); setGenerationError(""); setStep("nickname"); setPage("play");
  }

  async function generate(regenerate=false) {
    if(!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setGenerationError("");
    setStep("generate");
    const messages=["🤖 AI is warming up…","😂 Searching for comedy…","💥 Preparing the plot twist…","🧠 Translating your genius…"];
    let i=0; setLoading(messages[0]);
    const timer=setInterval(()=>{i++;setLoading(messages[i%messages.length]);},320);
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
      const submissionStory:Story={
        id: regenerate && activeStory ? activeStory.id : uid(),
        author:nickname.trim(),
        theme,
        prompt,
        title:g.title,
        text:g.text,
        promptPower:g.promptPower,
        ai:g.ai,
        votes:[],
        createdAt:Date.now()
      };
      storyRef.current=submissionStory;
      setStory(submissionStory);
      setStories(prev=>regenerate && activeStory ? prev.map(existing=>existing.id===activeStory.id?submissionStory:existing) : [submissionStory,...prev]);
      setStep("story");

      const competitionSave = await fetchJson<{ ok: boolean; submission: SubmissionRecord; round: CompetitionRound }>("/api/submissions", {
        method: "POST",
        body: JSON.stringify({
          participantName: nickname.trim(),
          prompt,
          resultText: g.text,
          title: g.title,
          theme: theme.title
        })
      });
      if (competitionSave.ok && competitionSave.submission) {
        storyRef.current = { ...submissionStory, id: competitionSave.submission.id };
        setStory({ ...submissionStory, id: competitionSave.submission.id });
      }
      await loadCompetition();
    } catch (error) {
      clearInterval(timer); window.clearTimeout(timeout);
      setGenerationError(error instanceof DOMException && error.name === "AbortError" ? "The story AI took too long to reply. Please try again." : error instanceof Error ? error.message : "The story AI could not generate a story. Please try again.");
      setStep(regenerate ? "story" : "prompt");
    } finally {
      setIsGenerating(false);
    }
  }

  const shellClass=`app ${largeText?"large-text":""} ${highContrast?"contrast":""} ${reduced?"reduced":""}`;
  const nav=(p:typeof page)=>{setPage(p); if(p==="play")startPlay();};

  function resetCurrentVoter() {
    setScoredSubmissionIds([]);
    setVoteError("");
    setVoteSuccess("");
    setVoteRatings(defaultRatings);
  }

  async function handleVoteSubmit() {
    if (!currentCandidate) {
      setVoteError("No more submissions to score.");
      return;
    }
    if (!voteRatings.overall) {
      setVoteError("Please choose a 1–5 Overall rating before submitting.");
      return;
    }
    if (voteName.trim() && currentCandidate.participantName.toLowerCase() === voteName.trim().toLowerCase()) {
      setVoteError("You cannot vote for your own submission.");
      return;
    }

    setIsSubmittingVote(true);
    setVoteError("");
    try {
      await fetchJson<{ ok: boolean }>("/api/votes", {
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
      setVoteSuccess("Vote recorded!");
      setScoredSubmissionIds((prev) => [...prev, currentCandidate.id]);
      setVoteRatings(defaultRatings);
      const nextRound = availableSubmissions.filter((submission) => submission.id !== currentCandidate.id);
      if (nextRound.length === 0) {
        setVoteSessionId(`Voter ${voterNumber + 1}`);
        setVoteName(`Voter ${voterNumber + 1}`);
        setVoterNumber((value) => value + 1);
        setTimeout(() => {
          setScoredSubmissionIds([]);
          setVoteSuccess("Voter complete. Pass the device to the next voter.");
        }, 700);
      }
    } catch (error) {
      setVoteError(error instanceof Error ? error.message : "The vote could not be saved. Please try again.");
    } finally {
      setIsSubmittingVote(false);
    }
  }

  const leaderboard = currentRound?.leaderboard ?? [];

  return <div className={shellClass}>
    <header className="topbar">
      <button className="brand" onClick={()=>nav("home")}><span className="brand-mark">✨</span><span>Prompt <b>Olympics</b></span></button>
      <nav>{(["home","play","gallery","leaderboard","voting"] as const).map(p=><button className={page===p?"active":""} onClick={()=>{ if (p === "voting" && competitionState !== "VOTING") { setPage("home"); return; } nav(p); }} key={p}>{p==="home"?"Home":p === "voting" ? "Voting" : p[0].toUpperCase()+p.slice(1)}</button>)}</nav>
      <a className="tiny admin-link" href="/admin">⚙️ Admin</a>
    </header>

    {page === "home" && <main className="home">
      <section className="hero">
        <div className="eyebrow">🏁 LIVE COMPETITION</div>
        <h1>Prompt <span>Olympics</span></h1>
        <p>{currentRound ? `Round ${currentRound.roundNumber}: ${currentRound.title}` : "Round 1"}</p>
        <div className="hero-actions">
          {competitionState === "SUBMISSIONS_OPEN" && <button className="primary" onClick={startPlay}>🚀 Join the challenge</button>}
          {competitionState === "VOTING" && <button className="primary" onClick={()=>setPage("voting")}>⭐ Enter Voting Mode</button>}
          {competitionState === "RESULTS" && <button className="primary" onClick={()=>setPage("leaderboard")}>🏆 View leaderboard</button>}
          {competitionState === "WAITING" && <button className="secondary" onClick={()=>setPage("play")}>⏳ Waiting for round start</button>}
        </div>
      </section>
      <section className="podium">
        <div><span>🏟️</span><div><small>ROUND</small><strong>{currentRound?.roundNumber ?? 1}</strong></div></div>
        <div><span>📊</span><div><small>STATE</small><strong>{competitionState}</strong></div></div>
        <div><span>🏆</span><div><small>SUBMISSIONS</small><strong>{currentRound?.submissions.length ?? 0}</strong></div></div>
      </section>
    </main>}

    {page === "play" && <main className="game">
      <div className="progress"><span>PLAY</span><div><i style={{width:`${({nickname:25,prompt:50,improve:70,generate:85,story:100} as Record<string,number>)[step]}%`}}/></div><span>{step.toUpperCase()}</span></div>
      {competitionState !== "SUBMISSIONS_OPEN" && competitionState !== "WAITING" ? <Card icon="⏳" title="Submissions are unavailable" sub="The organiser has closed the current submission round."><button className="primary full" onClick={()=>setPage("home")}>← Back home</button></Card> : null}
      {competitionState === "SUBMISSIONS_OPEN" && step === "nickname" && <Card icon="👋" title="Choose a nickname" sub="Pick a name to enter the competition."><div className="nickbox"><input value={nickname} maxLength={24} onChange={e=>setNickname(e.target.value)}/><button onClick={()=>setNickname(randomNick())}>🎲 Surprise me</button></div><button className="primary full" disabled={!nickname.trim()} onClick={()=>setStep("prompt")}>Continue →</button></Card>}
      {competitionState === "SUBMISSIONS_OPEN" && step === "prompt" && <PromptScreen prompt={prompt} setPrompt={setPrompt} onImprove={()=>setStep("improve")} onGenerate={generate} error={generationError} isGenerating={isGenerating}/>} 
      {competitionState === "SUBMISSIONS_OPEN" && step === "improve" && <Improve prompt={prompt} setPrompt={setPrompt} analysis={analysis} onBack={()=>setStep("prompt")} onGenerate={generate}/>} 
      {competitionState === "SUBMISSIONS_OPEN" && step === "generate" && <Card icon="🤖" title={loading} sub="Your idea is being turned into a story…"><div className="loader"><div>🏃</div><p>Writing your story…</p></div></Card>}
      {competitionState === "SUBMISSIONS_OPEN" && step === "story" && activeStory && <StoryCard story={activeStory} onRegenerate={()=>generate(true)} onBackToPrompt={()=>setStep("prompt")} error={generationError}/>} 
      {competitionState === "SUBMISSIONS_OPEN" && step === "story" && !activeStory && <Card icon="⚠️" title="Your story did not load" sub="Gemini did not return a story this time. Your prompt is still saved."><button className="primary full" onClick={()=>setStep("prompt")}>← Back to my prompt</button></Card>}
    </main>}

    {page === "gallery" && <Gallery stories={stories}/>} 
    {page === "leaderboard" && <Leaderboard stories={stories} />} 

    {page === "voting" && competitionState === "VOTING" && (
      <main className="content voting-screen">
        <div className="page-title compact">
          <div>
            <span>⭐ VOTING MODE</span>
            <h1>Rate the entries.</h1>
          </div>
        </div>

        {!currentCandidate ? (
          <section className="card centered voting-empty">
            <div className="bigicon">✅</div>
            <h2>Voting complete for this session.</h2>
            <p className="sub">All entries in this round have been scored by {voteSessionId}.</p>
            <button className="primary full" onClick={() => {
              const next = `Voter ${voterNumber + 1}`;
              setVoterNumber((value) => value + 1);
              setVoteSessionId(next);
              setVoteName(next);
              setScoredSubmissionIds([]);
              setVoteSuccess("Next voter ready.");
              setVoteError("");
              setVoteRatings(defaultRatings);
            }}>➡️ Next voter</button>
          </section>
        ) : (
          <section className="card voting-card">
            <div className="vote-header">
              <div>
                <small>Current voter</small>
                <h3>{voteSessionId}</h3>
              </div>
              <div>
                <small>Progress</small>
                <h3>{availableSubmissions.length} remaining</h3>
              </div>
            </div>

            <div className="voter-box">
              <label htmlFor="voter-name">Current voter name / identifier</label>
              <input id="voter-name" value={voteName} onChange={(e)=>setVoteName(e.target.value)} placeholder="Voter 1" />
            </div>

            <div className="submission-panel">
              <div className="submission-meta">
                <span>Result {Math.max(1, (currentRound?.submissions.length ?? 0) - availableSubmissions.length + 1)} of {currentRound?.submissions.length ?? 0}</span>
                <strong>{currentCandidate.participantName}</strong>
              </div>
              <h2>{currentCandidate.title ?? "Prompt Olympics Result"}</h2>
              <p>{currentCandidate.resultText}</p>
            </div>

            <div className="rating-area">
              {[
                ["😂 Funniest", "funniest"],
                ["💡 Most Creative", "mostCreative"],
                ["✨ Best Prompt", "bestPrompt"],
                ["⭐ Overall", "overall"]
              ].map(([label, key]) => (
                <div className="rating-row" key={key}>
                  <div className="rating-label">{label}</div>
                  <div className="star-row">
                    {[1,2,3,4,5].map((value) => (
                      <button
                        key={`${key}-${value}`}
                        className={`star-button ${voteRatings[key as keyof typeof voteRatings] >= value ? "selected" : ""}`}
                        onClick={() => setVoteRatings((prev) => ({ ...prev, [key]: value }))}
                        type="button"
                        aria-label={`${label} ${value} stars`}
                      >
                        {value <= (voteRatings[key as keyof typeof voteRatings] || 0) ? "★" : "☆"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {voteError && <p className="generation-error" role="alert">⚠️ {voteError}</p>}
            {voteSuccess && <p className="vote-success" role="status">✅ {voteSuccess}</p>}

            <div className="row voting-actions">
              <button className="secondary" onClick={() => { setVoteError(""); setVoteRatings(defaultRatings); }} type="button">Reset</button>
              <button className="primary" disabled={isSubmittingVote || !voteRatings.overall} onClick={handleVoteSubmit} type="button">{isSubmittingVote ? "Saving…" : "Submit vote"}</button>
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
function PromptScreen({prompt,setPrompt,onImprove,onGenerate,error,isGenerating}:{prompt:string,setPrompt:(s:string)=>void,onImprove:()=>void,onGenerate:()=>void,error:string,isGenerating:boolean}) {
  return <section className="card prompt-screen"><h2>What should happen?</h2><p className="sub">Describe your story idea clearly and keep the main premise in focus.</p>
    <div className="prompt-wrap"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={700} placeholder="Example: A robot attends a family dinner and takes everything literally."/><span>{prompt.length}/700</span></div>
    {error && <p className="generation-error" role="alert">⚠️ {error}</p>}<button className="secondary full" onClick={onImprove} disabled={isGenerating}>✨ Make it stronger</button><button className="primary full" disabled={!prompt.trim()||isGenerating} onClick={()=>onGenerate()}>🤖 Generate My Story</button>
  </section>
}
function Improve({prompt,setPrompt,analysis,onBack,onGenerate}:{prompt:string,setPrompt:(s:string)=>void,analysis:any,onBack:()=>void,onGenerate:()=>void}) {
  const lowest=Object.entries(analysis.vals).sort((a:any,b:any)=>a[1]-b[1]).slice(0,3).map(x=>x[0]);
 return <section className="card prompt-screen"><div className="challenge-mini">✨ PROMPT COACH</div><h2>Give your prompt a little boost.</h2><p className="sub">You only get one generation, so make it count.</p><div className="coach">{lowest.map(k=><button key={k} onClick={()=>setPrompt(prompt+fragments[k])}>💡 Add {k}<small>{fragments[k]}</small></button>)}</div><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} /><div className="row"><button className="secondary" onClick={onBack}>← Back</button><button className="primary" onClick={()=>onGenerate()}>Generate 🚀</button></div></section>
}
function StoryCard({story,onRegenerate,onBackToPrompt,error}:{story:Story,onRegenerate:()=>void,onBackToPrompt:()=>void,error:string}) {
  return <section className="card story-card"><div className="story-meta"><span>{story.theme.icon} {story.theme.title}</span><span>✨ Story ready</span></div><h2>{story.title}</h2><p className="story-text">{story.text}</p>{error && <p className="generation-error" role="alert">⚠️ {error}</p>}<button className="secondary full" onClick={onRegenerate}>🔄 Regenerate Story</button><button className="primary full" onClick={onBackToPrompt}>✍️ Write Another Story</button></section>
}
function Gallery({stories}:{stories:Story[]}) {
 const [sort,setSort]=useState("top"); const sorted=[...stories].sort((a,b)=>sort==="latest"?b.createdAt-a.createdAt:finalScore(b)-finalScore(a));
 return <main className="content"><div className="page-title"><div><span>📖 HALL OF FAME</span><h1>Stories worth<br/><em>remembering.</em></h1></div><div className="tabs">{["top","latest"].map(x=><button className={sort===x?"active":""} onClick={()=>setSort(x)} key={x}>{x}</button>)}</div></div>{!sorted.length?<div className="empty"><div>🏆</div><h2>Be the first Prompt Olympian!</h2><p>Create the first story and it will appear here.</p></div>:<div className="story-grid">{sorted.map(s=><article className="mini-story" key={s.id}><div><span>{s.theme.icon} {s.theme.title}</span><b>{finalScore(s).toFixed(1)}</b></div><h3>{s.title}</h3><p>{s.text}</p><small>by {s.author} · 🔥 {s.promptPower} · {s.votes.length} votes</small></article>)}</div>}</main>
}
function Leaderboard({stories}:{stories:Story[]}) {
 const sorted=[...stories].sort((a,b)=>finalScore(b)-finalScore(a));
 return <main className="content"><div className="page-title"><div><span>🥇 LEADERBOARD</span><h1>Who will take<br/><em>the podium?</em></h1></div></div>{!sorted.length?<div className="empty"><div>🏆</div><h2>The podium is waiting.</h2><p>Be the first Prompt Olympian to claim gold.</p></div>:<div className="leader">{sorted.map((s,i)=><div className="leader-row" key={s.id}><strong>{i+1===1?"🥇":i+1===2?"🥈":i+1===3?"🥉":`#${i+1}`}</strong><span>{s.author}<small>{s.title}</small></span><b>{finalScore(s).toFixed(1)}</b></div>)}</div>}</main>
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
      <main className="admin-login">
        <section className="card centered admin-card">
          <div className="bigicon">🔐</div>
          <h2>Admin access</h2>
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Enter admin password" />
          {error && <p className="generation-error" role="alert">⚠️ {error}</p>}
          <div className="row">
            <a className="secondary button-link" href="/">← Back to app</a>
            <button className="primary" onClick={loadAdminData}>Unlock admin</button>
          </div>
        </section>
      </main>
    ) : (
      <main className="content admin-panel">
        <div className="page-title admin-header">
          <div>
            <span>🛡️ ADMIN</span>
            <h1>Round {currentRound?.roundNumber ?? 1}</h1>
          </div>
          <div className="row small-row">
            <button className="secondary" onClick={() => window.location.href = "/"}>Back to event</button>
            <button className="primary" onClick={() => callAdmin("/api/admin/start-submissions")}>Open submissions</button>
            <button className="secondary" onClick={() => callAdmin("/api/admin/close-submissions")}>Close submissions</button>
            <button className="primary" onClick={() => callAdmin("/api/admin/start-voting")}>Start voting</button>
            <button className="secondary" onClick={() => callAdmin("/api/admin/end-voting")}>End voting</button>
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
