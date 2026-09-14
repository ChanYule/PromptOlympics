import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { finalScore, humanScore, aiScore } from "./scoring";
import {
  scoreOtherStory
} from "./storyGeneration";

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

const themes: Theme[] = [
  {id:"hero",title:"Unexpected Hero",premise:"An ordinary grandparent suddenly becomes a superhero.",icon:"🦸",difficulty:"Easy",subjects:["grandparent","superhero","ordinary","family"],bonuses:["🚇 a train station","🐱 a talking cat"]},
  {id:"pet-ceo",title:"Pet CEO",premise:"A pet becomes the boss of a very serious company.",icon:"🐶",difficulty:"Easy",subjects:["pet","dog","cat","CEO","company","boss"],bonuses:["☕ a coffee machine","📊 a board meeting"]},
  {id:"robot-dinner",title:"Robot at Dinner",premise:"A robot attends a family dinner and takes everything literally.",icon:"🤖",difficulty:"Medium",subjects:["robot","family","dinner","food"],bonuses:["🍲 a mysterious soup","📸 a family photo"]},
  {id:"vending",title:"Vending Machine",premise:"Someone gets trapped inside a vending machine.",icon:"🥤",difficulty:"Medium",subjects:["vending","machine","snack","trapped"],bonuses:["🪙 a coin","🍫 chocolate"]},
  {id:"elevator",title:"The Opinionated Elevator",premise:"An elevator develops strong opinions about everyone who enters.",icon:"🛗",difficulty:"Medium",subjects:["elevator","building","floor","opinion"],bonuses:["🎵 elevator music","🧑‍💼 a manager"]},
  {id:"printer",title:"Printer Problems",premise:"A printer decides it has had enough of office life.",icon:"🖨️",difficulty:"Easy",subjects:["printer","office","paper","work"],bonuses:["📄 a missing document","☕ coffee"]},
  {id:"alien",title:"Alien Tourist",premise:"An alien visits Singapore and misunderstands everything.",icon:"👽",difficulty:"Hard",subjects:["alien","Singapore","tourist","travel"],bonuses:["🚇 an MRT station","🍜 a food court"]},
  {id:"talking-cat",title:"Talking Cat",premise:"A cat finally speaks, but only to complain about its human.",icon:"🐱",difficulty:"Easy",subjects:["cat","human","pet","talk"],bonuses:["📱 a phone","🛋️ a sofa"]},
  {id:"gps",title:"GPS Gone Rogue",premise:"A GPS develops a dramatic personality and refuses to cooperate.",icon:"📍",difficulty:"Medium",subjects:["GPS","car","map","direction"],bonuses:["🚗 a taxi","🏁 the wrong destination"]},
  {id:"office",title:"Office Apocalypse",premise:"A normal workday turns into an absurd office disaster.",icon:"💼",difficulty:"Hard",subjects:["office","work","boss","meeting"],bonuses:["📧 an email","🥪 lunch"]},
  {id:"wizard",title:"Wizard on a Day Off",premise:"A powerful wizard tries to have a completely normal day.",icon:"🧙",difficulty:"Medium",subjects:["wizard","magic","normal","day"],bonuses:["🚌 a bus","🍦 ice cream"]},
  {id:"celebrity",title:"Famous for Nothing",premise:"Someone becomes a celebrity for doing something incredibly ordinary.",icon:"🌟",difficulty:"Easy",subjects:["celebrity","famous","ordinary","viral"],bonuses:["📸 a selfie","🎤 an interview"]}
];

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
  // mild creativity bonus, while keeping the score independent of raw length
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

  // Map quality scores to AI metrics
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
    commentary =
      "The AI judge has concerns. Mainly because it is laughing too hard to continue.";
  } else if (overall >= 8) {
    commentary =
      "Strong comedy. The situation escalated beautifully.";
  } else if (overall >= 7) {
    commentary =
      "Pretty solid. The AI judge reluctantly approves.";
  } else if (overall >= 5) {
    commentary =
      "A decent attempt. The comedy department requests more chaos.";
  } else {
    commentary =
      "The story survived. The jokes are still under investigation.";
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

function Weighting() {
  return <div className="weighting" aria-label="Scoring weights: AI 50 percent, humans 50 percent"><span>AI <b>50%</b></span><span>Humans <b>50%</b></span></div>;
}
function ScoreBreakdown({story}:{story:Story}) {
  const human = humanScore(story);
  return <div className="score-summary"><Weighting/><p>{human === null ? "Provisional AI score / awaiting human votes" : `AI ${aiScore(story.ai.overall).toFixed(1)}/5 + human average ${human.toFixed(1)}/5 / equal weight`}</p></div>;
}

function App() {
  const [page,setPage]=useState<"home"|"play"|"judge"|"gallery"|"leaderboard"|"guide">("home");
  const [step,setStep]=useState<"nickname"|"challenge"|"prompt"|"improve"|"generate"|"story"|"judge"|"reveal"|"results">("nickname");
  const [nickname,setNickname]=useState(randomNick());
  const [theme,setTheme]=useState(themes[Math.floor(Math.random()*themes.length)]);
  const [prompt,setPrompt]=useState("");
  const [story,setStory]=useState<Story|null>(null);
  const storyRef=useRef<Story|null>(null);
  const [stories,setStories]=useState<Story[]>(()=>{
    try {
      const raw=JSON.parse(localStorage.getItem("promptOlympicsStories") ?? "[]");
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  });
  const [judgeStory,setJudgeStory]=useState<Story|null>(null);
  const [vote,setVote]=useState({funny:0,creative:0,surprise:0,fit:0});
  const [myJudged,setMyJudged]=useState(false);
  const [loading,setLoading]=useState("🤖 AI is warming up…");
  const [generationError,setGenerationError]=useState("");
  const [isGenerating,setIsGenerating]=useState(false);
  const [largeText,setLargeText]=useState(false);
  const [highContrast,setHighContrast]=useState(false);
  const [reduced,setReduced]=useState(false);
  const [sound,setSound]=useState(true);
  const [admin,setAdmin]=useState(false);

  useEffect(()=>{ localStorage.setItem("promptOlympicsStories",JSON.stringify(stories)); },[stories]);

  const analysis=useMemo(()=>promptAnalysis(prompt),[prompt]);
  const categories=Object.entries(analysis.vals);
  const availableJudge=stories.filter(s=>s.author.toLowerCase()!==nickname.trim().toLowerCase() && !s.votes.some(v=>v.voter.toLowerCase()===nickname.trim().toLowerCase()));
  const humanAvg=judgeStory && vote.funny&&vote.creative&&vote.surprise&&vote.fit ? (vote.funny+vote.creative+vote.surprise+vote.fit)/4 : 0;
  const currentStory=story ?? storyRef.current;
  const activeStory=stories.find(s=>s.id===currentStory?.id) ?? currentStory;

  function startPlay() {
    storyRef.current=null; setNickname(randomNick()); setTheme(themes[Math.floor(Math.random()*themes.length)]); setPrompt(""); setStory(null); setMyJudged(false); setStep("nickname"); setPage("play");
  }
  function chooseChallenge() { setTheme(themes[Math.floor(Math.random()*themes.length)]); setStep("prompt"); }
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
      const s:Story={id:regenerate && activeStory ? activeStory.id : uid(),author:nickname.trim(),theme,prompt,title:g.title,text:g.text,promptPower:g.promptPower,ai:g.ai,votes:[],createdAt:Date.now()};
      storyRef.current=s; setStory(s); setStories(prev=>regenerate && activeStory ? prev.map(existing=>existing.id===activeStory.id?s:existing) : [s,...prev]); setStep("story");
    } catch (error) {
      clearInterval(timer); window.clearTimeout(timeout);
      setGenerationError(error instanceof DOMException && error.name === "AbortError" ? "The story AI took too long to reply. Please try again." : error instanceof Error ? error.message : "The story AI could not generate a story. Please try again.");
      setStep(regenerate ? "story" : "prompt");
    } finally {
      setIsGenerating(false);
    }
  }
  function loadJudge() {
    const choices=stories.filter(s=>s.author.toLowerCase()!==nickname.trim().toLowerCase() && !s.votes.some(v=>v.voter.toLowerCase()===nickname.trim().toLowerCase()));
    if(choices.length){setJudgeStory(choices[Math.floor(Math.random()*choices.length)]);setVote({funny:0,creative:0,surprise:0,fit:0});setStep("judge");}
    else { setJudgeStory(null); setStep("results"); }
  }
  function submitVote() {
    if(!judgeStory || Object.values(vote).some(v=>!v)) return;
    const updated={...judgeStory,votes:[...judgeStory.votes.filter(v=>v.voter.toLowerCase()!==nickname.trim().toLowerCase()),{...vote,voter:nickname.trim()}]};
    setStories(prev=>prev.map(s=>s.id===updated.id?updated:s));
    setJudgeStory(updated); setMyJudged(true); setStep("reveal");
  }
  function playAgain(){ startPlay(); }

  const shellClass=`app ${largeText?"large-text":""} ${highContrast?"contrast":""} ${reduced?"reduced":""}`;
  const nav=(p:typeof page)=>{setPage(p); if(p==="play")startPlay();};

  return <div className={shellClass}>
    <header className="topbar">
      <button className="brand" onClick={()=>nav("home")}><span className="brand-mark">🏅</span><span>Prompt <b>Olympics</b></span></button>
      <nav aria-label="Main navigation">{(["home","play","gallery","leaderboard","guide"] as const).map(p=><button aria-current={page===p?"page":undefined} className={page===p?"active":""} onClick={()=>nav(p)} key={p}>{p==="home"?"Home":p[0].toUpperCase()+p.slice(1)}</button>)}</nav>
      <button aria-label="Event settings" aria-expanded={admin} className="tiny" onClick={()=>setAdmin(!admin)}>⚙️</button>
    </header>

    {admin && <div className="adminbar">
      <b>Admin</b><span>Demo controls</span>
      <button onClick={()=>setStories([])}>Reset event data</button>
      <button onClick={()=>setLargeText(!largeText)}>Large text</button>
      <button onClick={()=>setHighContrast(!highContrast)}>High contrast</button>
      <button onClick={()=>setReduced(!reduced)}>Reduced motion</button>
      <button onClick={()=>setSound(!sound)}>Sound {sound?"on":"off"}</button>
      <button onClick={()=>setAdmin(false)}>Close</button>
    </div>}

    {page==="home" && <main className="home">
      <section className="hero">
        <div className="eyebrow">🏟️ THE AI COMEDY CHALLENGE</div>
        <h1>Create.<br/><span>Laugh.</span> Judge.<br/>Compete.</h1>
        <p>Can your prompt write the funniest story? Write a prompt, watch AI turn it into comedy, then decide if other players can beat the AI judge.</p>
        <Weighting/><div className="hero-actions"><button className="primary" onClick={startPlay}>🚀 Start the Challenge</button><button className="secondary" onClick={()=>setPage("gallery")}>👀 See the Hall of Fame</button></div>
        <div className="explainer"><div><b>✍️</b><strong>Write</strong><small>Craft your prompt</small></div><div className="arrow">→</div><div><b>🤖</b><strong>Generate</strong><small>AI creates the story</small></div><div className="arrow">→</div><div><b>🧑‍⚖️</b><strong>Judge</strong><small>Beat the AI judge</small></div></div>
      </section>
      <section className="podium">
        <div><span>🏆</span><div><small>TOP SCORE (PROVISIONAL UNTIL VOTED)</small><strong>{stories.length?Math.max(...stories.map(finalScore)).toFixed(1):"—"}</strong></div></div>
        <div><span>📚</span><div><small>STORIES PUBLISHED</small><strong>{stories.length||"—"}</strong></div></div>
        <div><span>😂</span><div><small>AVERAGE SCORE</small><strong>{stories.length?(stories.reduce((a,s)=>a+finalScore(s),0)/stories.length).toFixed(1):"—"}</strong></div></div>
      </section>
    </main>}

    {page==="play" && <main className="game">
      <div className="progress"><span>PLAY</span><div><i style={{width:`${({nickname:10,challenge:20,prompt:40,improve:55,generate:65,story:75,judge:85,reveal:92,results:100} as Record<string,number>)[step]}%`}}/></div><span>{step.toUpperCase()}</span></div>
      {step==="nickname" && <Card icon="👋" title="Welcome, Prompt Olympian!" sub="First, choose your temporary competition nickname."><div className="nickbox"><input value={nickname} maxLength={24} onChange={e=>setNickname(e.target.value)}/><button onClick={()=>setNickname(randomNick())}>🎲 Surprise me</button></div><button className="primary full" disabled={!nickname.trim()} onClick={()=>setStep("challenge")}>Continue →</button></Card>}
      {step==="challenge" && <Card icon={theme.icon} title={theme.title} sub={theme.premise}><div className="theme-card"><span>CHALLENGE</span><p>{theme.premise}</p><div className="bonus">{theme.bonuses.map(b=><em key={b}>{b}</em>)}</div></div><button className="secondary full" onClick={()=>setTheme(themes[Math.floor(Math.random()*themes.length)])}>🎲 Different challenge</button><button className="primary full" onClick={()=>setStep("prompt")}>Let's write! ✍️</button></Card>}
      {step==="prompt" && <PromptScreen prompt={prompt} setPrompt={setPrompt} analysis={analysis} categories={categories} onImprove={()=>setStep("improve")} onGenerate={generate} themeTitle={theme.title} error={generationError} isGenerating={isGenerating}/>}
      {step==="improve" && <Improve prompt={prompt} setPrompt={setPrompt} analysis={analysis} onBack={()=>setStep("prompt")} onGenerate={generate}/>}
      {step==="generate" && <Card icon="🤖" title={loading} sub="Your prompt is being transformed into comedy…"><div className="loader"><div>🏃</div><p>Running the Prompt Olympics…</p></div></Card>}
      {step==="story" && activeStory && <StoryCard story={activeStory} onContinue={loadJudge} onRegenerate={()=>generate(true)} error={generationError}/>}
      {step==="story" && !activeStory && <Card icon="⚠️" title="Your story did not load" sub="Gemini did not return a story this time. Your prompt is still saved, so you can try again."><button className="primary full" onClick={()=>setStep("prompt")}>← Back to my prompt</button></Card>}
      {step==="judge" && judgeStory && <JudgeCard story={judgeStory} vote={vote} setVote={setVote} onSubmit={submitVote}/>}
      {step==="reveal" && judgeStory && <Reveal story={judgeStory} humanAvg={humanAvg} onNext={loadJudge}/>}
      {step==="results" && activeStory && <Results story={activeStory} myJudged={myJudged} onAgain={playAgain} onHall={()=>setPage("leaderboard")}/>}
      {step==="results" && !activeStory && <Card icon="🏁" title="No more stories to judge!" sub="Be the first Prompt Olympian to publish a story."><button className="primary full" onClick={startPlay}>Create a story</button></Card>}
    </main>}

    {page==="judge" && <main className="game standalone">{judgeStory ? <><div className="judge-head"><span>🧑‍⚖️ YOU ARE THE JUDGE</span><button onClick={loadJudge}>New Voter</button></div><JudgeCard story={judgeStory} vote={vote} setVote={setVote} onSubmit={submitVote}/></> : <Card icon="🧑‍⚖️" title="Ready to judge?" sub={stories.length?"Pick a story and decide if humans can beat the AI.":"There aren't any stories yet."}><button className="primary full" onClick={loadJudge}>{stories.length?"Judge a story":"Start playing"}</button></Card>}</main>}

    {page==="gallery" && <Gallery stories={stories}/>}
    {page==="leaderboard" && <Leaderboard stories={stories}/>}
    {page==="guide" && <Guide onPlay={startPlay}/>}
  </div>
}

function Card({icon,title,sub,children}:{icon:string,title:string,sub:string,children:React.ReactNode}) {
  return <section className="card centered"><div className="bigicon">{icon}</div><h2>{title}</h2><p className="sub">{sub}</p>{children}</section>
}
function PromptScreen({prompt,setPrompt,analysis,categories,onImprove,onGenerate,themeTitle,error,isGenerating}:{prompt:string,setPrompt:(s:string)=>void,analysis:any,categories:[string,unknown][],onImprove:()=>void,onGenerate:()=>void,themeTitle:string,error:string,isGenerating:boolean}) {
  const append=(key:string)=>{const f=fragments[key]; if(f&&!prompt.includes(f))setPrompt(prompt.trim()+f)};
  return <section className="card prompt-screen"><div className="challenge-mini">✍️ YOUR TURN · WRITE THE FUNNIEST PROMPT</div><div className="challenge-banner"><span>Current challenge</span><strong>{themeTitle}</strong></div><h2>What should happen?</h2><p className="sub">Be specific. The better your instructions, the more powerful your prompt.</p>
    <div className="prompt-wrap"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={700} placeholder="Example: Write a funny story about a grumpy grandparent who accidentally becomes a superhero at an MRT station…"/><span>{prompt.length}/700</span></div>
    <div className="power"><div><strong>🔥 Prompt Power</strong><b>{analysis.total}/100</b></div><div className="flames">{"🔥".repeat(Math.ceil(analysis.total/20)||0)}{"▫️".repeat(5-Math.ceil(analysis.total/20))}</div></div>
    <div className="chips">{categories.map(([name,val])=><span className={Number(val)>=(scoreCategories.find(x=>x[0]===name)?.[1]??1)/2?"done":""} key={name}>{Number(val)>=(scoreCategories.find(x=>x[0]===name)?.[1]??1)/2?"✅":"💡"} {name}</span>)}</div>
    <div className="suggestions">{["Audience","Context","Specificity","Constraints","Output format","Creativity","Humour"].filter(k=>!prompt.includes(fragments[k])).slice(0,5).map(k=><button onClick={()=>append(k)} key={k}>＋ {k}</button>)}</div>
    {error && <p className="generation-error" role="alert">⚠️ {error}</p>}<button className="secondary full" onClick={onImprove} disabled={isGenerating}>✨ Want to make your prompt stronger?</button><button className="primary full" disabled={!prompt.trim()||isGenerating} onClick={onGenerate}>🤖 Generate My Story</button>
  </section>
}
function Improve({prompt,setPrompt,analysis,onBack,onGenerate}:{prompt:string,setPrompt:(s:string)=>void,analysis:any,onBack:()=>void,onGenerate:()=>void}) {
  const lowest=Object.entries(analysis.vals).sort((a:any,b:any)=>a[1]-b[1]).slice(0,3).map(x=>x[0]);
  return <section className="card prompt-screen"><div className="challenge-mini">✨ PROMPT COACH</div><h2>Give your prompt a little boost.</h2><p className="sub">You only get one generation, so make it count.</p><div className="coach">{lowest.map(k=><button key={k} onClick={()=>setPrompt(prompt+fragments[k])}>💡 Add {k}<small>{fragments[k]}</small></button>)}</div><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} /><div className="row"><button className="secondary" onClick={onBack}>← Back</button><button className="primary" onClick={onGenerate}>Generate 🚀</button></div></section>
}
function StoryCard({story,onContinue,onRegenerate,error}:{story:Story,onContinue:()=>void,onRegenerate:()=>void,error:string}) {
  return <section className="card story-card"><div className="story-meta"><span>{story.theme.icon} {story.theme.title}</span><span>🔥 Prompt Power {story.promptPower}</span></div><h2>{story.title}</h2><p className="story-text">{story.text}</p>{error && <p className="generation-error" role="alert">⚠️ {error}</p>}<button className="secondary full" onClick={onRegenerate}>🔄 Regenerate Story</button><div className="secret"><span>🔒 AI verdict hidden</span><small>Judge another player's story first to reveal your score.</small></div><button className="primary full" onClick={onContinue}>🧑‍⚖️ Judge Another Player's Story →</button></section>
}
function Rating({label,icon,value,onChange}:{label:string,icon:string,value:number,onChange:(n:number)=>void}) {
 return <div className="rating"><b>{icon} {label}</b><div role="group" aria-label={label}>{[1,2,3,4,5].map(n=><button aria-label={`${label}: ${n} out of 5`} aria-pressed={n===value} className={n===value?"selected":""} onClick={()=>onChange(n)} key={n}>{n}</button>)}</div></div>
}
function JudgeCard({story,vote,setVote,onSubmit}:{story:Story,vote:any,setVote:(v:any)=>void,onSubmit:()=>void}) {
 const scorePreview = scoreOtherStory(story.text, story.theme.title, story.prompt);
 return <section className="card judge-card"><div className="judge-label">🧑‍⚖️ YOU ARE THE JUDGE · BLIND</div><div className="challenge-banner compact"><span>Challenge</span><strong>{story.theme.title}</strong></div><h2>{story.title}</h2><p className="story-text">{story.text}</p><div className="quick-score"><div><span>Quick score</span><strong>{scorePreview.overall.toFixed(1)}/5</strong></div><small>{scorePreview.summary}</small></div><Weighting/><p className="rating-help">Rate each category from 1 (low) to 5 (high). Human votes are averaged, then count for half the score.</p><div className="ratings"><Rating label="Funny" icon="😂" value={vote.funny} onChange={n=>setVote({...vote,funny:n})}/><Rating label="Creative" icon="💡" value={vote.creative} onChange={n=>setVote({...vote,creative:n})}/><Rating label="Surprising" icon="🤯" value={vote.surprise} onChange={n=>setVote({...vote,surprise:n})}/><Rating label="Fits the Challenge" icon="🎯" value={vote.fit} onChange={n=>setVote({...vote,fit:n})}/></div><button className="primary full" disabled={Object.values(vote).some((v:any)=>!v)} onClick={onSubmit}>Submit My Verdict ⚖️</button></section>
}
function Reveal({story,humanAvg,onNext}:{story:Story,humanAvg:number,onNext:()=>void}) {
 return <section className="card reveal"><div className="bigicon">⚖️</div><h2>Humans vs AI</h2><p className="sub">Here's how your verdict compares.</p><div className="compare"><div><span>🧑‍⚖️ HUMAN</span><strong>{(humanAvg).toFixed(1)}</strong><small>/ 5</small></div><div><span>🤖 AI</span><strong>{aiScore(story.ai.overall).toFixed(1)}</strong><small>/ 5</small></div></div><ScoreBreakdown story={story}/><div className="ai-breakdown">{[["😂 Humour",story.ai.humour],["💡 Creativity",story.ai.creativity],["🤯 Surprise",story.ai.surprise],["✍️ Prompt Quality",story.ai.promptQuality],["🎯 Challenge Fit",story.ai.fit]].map(([k,v])=><div key={String(k)}><span>{k}</span><b>{aiScore(Number(v)).toFixed(1)}</b></div>)}</div><p className="verdict">{Math.abs(humanAvg-aiScore(story.ai.overall))<0.5?"🤝 Humans and AI agree!":(humanAvg>aiScore(story.ai.overall)?"😂 You loved this more than the AI!":"🤖 AI saw the comedy before you did!")}</p><p className="commentary">“{story.ai.commentary}”</p><button className="primary full" onClick={onNext}>Next Story →</button></section>
}
function Results({story,myJudged,onAgain,onHall}:{story:Story,myJudged:boolean,onAgain:()=>void,onHall:()=>void}) {
 const score=finalScore(story);
 return <section className="card result"><div className="bigicon">🏆</div><span>{story.votes.length?"YOUR COMBINED SCORE":"YOUR PROVISIONAL SCORE"}</span><div className="score">{myJudged?score.toFixed(1):"—"}<small>/5</small></div>{myJudged && <ScoreBreakdown story={story}/>}<h2>{myJudged?(score>=4.5?"🏅 Prompt Champion!":score>=3.75?"🌟 Strong showing!":"👏 Nice first run!"):"Judge one more story to unlock your result!"}</h2><p className="sub">{myJudged?story.ai.commentary:"Your AI verdict stays hidden until you complete a blind judgement."}</p><div className="row"><button className="secondary" onClick={onHall}>🏆 Hall of Fame</button><button className="primary" onClick={onAgain}>🔄 Play Again</button></div></section>
}
function Gallery({stories}:{stories:Story[]}) {
 const [sort,setSort]=useState("top"); const sorted=[...stories].sort((a,b)=>sort==="latest"?b.createdAt-a.createdAt:finalScore(b)-finalScore(a));
 return <main className="content"><div className="page-title"><div><span>📖 HALL OF FAME</span><h1>Stories worth<br/><em>remembering.</em></h1></div><div className="tabs">{["top","latest"].map(x=><button className={sort===x?"active":""} onClick={()=>setSort(x)} key={x}>{x}</button>)}</div></div>{!sorted.length?<Empty icon="🏆" title="Be the first Prompt Olympian!" text="Create the first story and it will appear here."/>:<div className="story-grid">{sorted.map(s=><article className="mini-story" key={s.id}><div><span>{s.theme.icon} {s.theme.title}</span><b>{finalScore(s).toFixed(1)}<small>/5</small></b></div><h3>{s.title}</h3><p>{s.text}</p><p className="score-status">{s.votes.length?"50% AI + 50% humans":"Provisional / awaiting human votes"}</p><small>by {s.author} · 🔥 {s.promptPower} · {s.votes.length} votes</small></article>)}</div>}</main>
}
function Leaderboard({stories}:{stories:Story[]}) {
 const sorted=[...stories].sort((a,b)=>finalScore(b)-finalScore(a));
 return <main className="content"><div className="page-title"><div><span>🥇 LEADERBOARD</span><h1>Who will take<br/><em>the podium?</em></h1></div></div><ScoreRules/>{!sorted.length?<Empty icon="🏆" title="The podium is waiting." text="Be the first Prompt Olympian to claim gold."/>:<div className="leader">{sorted.map((s,i)=><div className="leader-row" key={s.id}><strong>{i+1===1?"🥇":i+1===2?"🥈":i+1===3?"🥉":`#${i+1}`}</strong><span>{s.author}<small>{s.title}</small><small className="score-status">{s.votes.length?`${s.votes.length} votes / 50% AI + 50% humans`:"Provisional / awaiting human votes"}</small></span><b>{finalScore(s).toFixed(1)}<small>/5</small></b></div>)}</div>}</main>
}
function ScoreRules() { return <div className="score-rules"><Weighting/><p>Every voice counts. AI scores and average human ratings are both out of 5, then combined with equal weight. Scores awaiting votes are provisional.</p></div> }
function Empty({icon,title,text}:{icon:string,title:string,text:string}) { return <div className="empty"><div>{icon}</div><h2>{title}</h2><p>{text}</p></div> }
function Guide({onPlay}:{onPlay:()=>void}) {
 const powers=[["🎯","Goal","Say exactly what you want the AI to create."],["👥","Audience","Tell it who the story is for."],["📍","Context","Give the situation, place or reason."],["🔍","Specificity","Add concrete details instead of vague ideas."],["💥","Creativity","Ask for twists, surprises and unusual details."]];
 return <main className="content guide"><div className="page-title"><div><span>📚 QUICK GUIDE</span><h1>Five Prompt<br/><em>Powers.</em></h1></div></div><p className="lead">A strong prompt gives AI enough direction to be useful while leaving room for creativity.</p><div className="powers">{powers.map((p,i)=><div key={p[1]}><strong>{i+1}</strong><span>{p[0]}</span><section><h3>{p[1]}</h3><p>{p[2]}</p></section></div>)}</div><ScoreRules/><div className="formula"><b>Prompt formula</b><p>“Create <mark>WHAT</mark> for <mark>WHO</mark>, in <mark>WHAT CONTEXT</mark>, with <mark>SPECIFIC DETAILS</mark> and <mark>ONE SURPRISE</mark>.”</p></div><button className="primary" onClick={onPlay}>🚀 Try it yourself</button></main>
}

createRoot(document.getElementById("root")!).render(<App />);
