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

function finalScore(s:Story) {
  if (!s.votes.length) return s.ai.overall;
  const avg=s.votes.reduce((a,v)=>a+(v.funny+v.creative+v.surprise+v.fit)/4,0)/s.votes.length;
  const human=((avg-1)/4)*10;
  return s.ai.overall*.5+human*.5;
}

function App() {
const [page,setPage]=useState<"home"|"play"|"gallery"|"leaderboard">("home");
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
  const [admin,setAdmin]=useState(false);

  useEffect(()=>{ try { const raw=localStorage.getItem("promptOlympicsStories"); if(raw)setStories(JSON.parse(raw)); } catch {} },[]);
  useEffect(()=>{ localStorage.setItem("promptOlympicsStories",JSON.stringify(stories)); },[stories]);

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

  const shellClass=`app ${largeText?"large-text":""} ${highContrast?"contrast":""} ${reduced?"reduced":""}`;
  const nav=(p:typeof page)=>{setPage(p); if(p==="play")startPlay();};

  return <div className={shellClass}>
    <header className="topbar">
      <button className="brand" onClick={()=>nav("home")}><span className="brand-mark">✨</span><span>Story <b>Studio</b></span></button>
      <nav>{(["home","play","gallery","leaderboard"] as const).map(p=><button className={page===p?"active":""} onClick={()=>nav(p)} key={p}>{p==="home"?"Home":p[0].toUpperCase()+p.slice(1)}</button>)}</nav>
      <button className="tiny" onClick={()=>setAdmin(!admin)}>⚙️</button>
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
        <div className="eyebrow">✨ AI STORY GENERATOR</div>
        <h1>Create<br/><span>funny stories</span> from your idea.</h1>
        <p>Type a story premise, let the AI turn it into a short comedy, and keep refining the result until it feels right.</p>
        <div className="hero-actions"><button className="primary" onClick={startPlay}>🚀 Start Writing</button><button className="secondary" onClick={()=>setPage("gallery")}>👀 See stories</button></div>
      </section>
      <section className="podium">
        <div><span>📚</span><div><small>STORIES</small><strong>{stories.length||"—"}</strong></div></div>
        <div><span>✨</span><div><small>MOST RECENT</small><strong>{stories[0] ? finalScore(stories[0]).toFixed(1) : "—"}</strong></div></div>
        <div><span>🎭</span><div><small>TOP SCORE</small><strong>{stories.length?Math.max(...stories.map(finalScore)).toFixed(1):"—"}</strong></div></div>
      </section>
    </main>}

    {page==="play" && <main className="game">
      <div className="progress"><span>PLAY</span><div><i style={{width:`${({nickname:25,prompt:50,improve:70,generate:85,story:100} as Record<string,number>)[step]}%`}}/></div><span>{step.toUpperCase()}</span></div>
      {step==="nickname" && <Card icon="👋" title="Choose a nickname" sub="Pick a name for your story studio."><div className="nickbox"><input value={nickname} maxLength={24} onChange={e=>setNickname(e.target.value)}/><button onClick={()=>setNickname(randomNick())}>🎲 Surprise me</button></div><button className="primary full" disabled={!nickname.trim()} onClick={()=>setStep("prompt")}>Continue →</button></Card>}
      {step==="prompt" && <PromptScreen prompt={prompt} setPrompt={setPrompt} onImprove={()=>setStep("improve")} onGenerate={generate} error={generationError} isGenerating={isGenerating}/>} 
      {step==="improve" && <Improve prompt={prompt} setPrompt={setPrompt} analysis={analysis} onBack={()=>setStep("prompt")} onGenerate={generate}/>} 
      {step==="generate" && <Card icon="🤖" title={loading} sub="Your idea is being turned into a story…"><div className="loader"><div>🏃</div><p>Writing your story…</p></div></Card>}
      {step==="story" && activeStory && <StoryCard story={activeStory} onRegenerate={()=>generate(true)} onBackToPrompt={()=>setStep("prompt")} error={generationError}/>} 
      {step==="story" && !activeStory && <Card icon="⚠️" title="Your story did not load" sub="Gemini did not return a story this time. Your prompt is still saved, so you can try again."><button className="primary full" onClick={()=>setStep("prompt")}>← Back to my prompt</button></Card>}
    </main>}

    {page==="gallery" && <Gallery stories={stories}/>}
    {page==="leaderboard" && <Leaderboard stories={stories}/>} 
  </div>
}

function Card({icon,title,sub,children}:{icon:string,title:string,sub:string,children:React.ReactNode}) {
  return <section className="card centered"><div className="bigicon">{icon}</div><h2>{title}</h2><p className="sub">{sub}</p>{children}</section>
}
function PromptScreen({prompt,setPrompt,onImprove,onGenerate,error,isGenerating}:{prompt:string,setPrompt:(s:string)=>void,onImprove:()=>void,onGenerate:()=>void,error:string,isGenerating:boolean}) {
  return <section className="card prompt-screen"><h2>What should happen?</h2><p className="sub">Describe your story idea clearly and keep the main premise in focus.</p>
    <div className="prompt-wrap"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={700} placeholder="Example: A robot attends a family dinner and takes everything literally."/><span>{prompt.length}/700</span></div>
    {error && <p className="generation-error" role="alert">⚠️ {error}</p>}<button className="secondary full" onClick={onImprove} disabled={isGenerating}>✨ Make it stronger</button><button className="primary full" disabled={!prompt.trim()||isGenerating} onClick={onGenerate}>🤖 Generate My Story</button>
  </section>
}
function Improve({prompt,setPrompt,analysis,onBack,onGenerate}:{prompt:string,setPrompt:(s:string)=>void,analysis:any,onBack:()=>void,onGenerate:()=>void}) {
  const lowest=Object.entries(analysis.vals).sort((a:any,b:any)=>a[1]-b[1]).slice(0,3).map(x=>x[0]);
  return <section className="card prompt-screen"><div className="challenge-mini">✨ PROMPT COACH</div><h2>Give your prompt a little boost.</h2><p className="sub">You only get one generation, so make it count.</p><div className="coach">{lowest.map(k=><button key={k} onClick={()=>setPrompt(prompt+fragments[k])}>💡 Add {k}<small>{fragments[k]}</small></button>)}</div><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} /><div className="row"><button className="secondary" onClick={onBack}>← Back</button><button className="primary" onClick={onGenerate}>Generate 🚀</button></div></section>
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

createRoot(document.getElementById("root")!).render(<App />);
