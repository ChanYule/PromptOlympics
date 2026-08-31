// Story Generation Pipeline
// Replaces hardcoded templates with premise-driven generation

interface Premise {
  protagonist: string;
  setting: string;
  premise: string;
  conflict: string;
  comedyMechanism: string;
}

interface StoryOutline {
  hook: string;
  setup: string;
  problem: string;
  escalation1: string;
  escalation2: string;
  twist: string;
  punchline: string;
}

interface QualityScore {
  relevance: number;
  logicFlow: number;
  settingConsistency: number;
  characterConsistency: number;
  humour: number;
  escalation: number;
  punchlineStrength: number;
  endingQuality: number;
  overall: number;
}

interface StoryGenerationResult {
  text: string;
  outline: StoryOutline;
  qualityScore: QualityScore;
  needsRegeneration: boolean;
  issues: string[];
}

export interface StoryScoringResult {
  funny: number;
  creativity: number;
  surprise: number;
  challengeFit: number;
  overall: number;
  summary: string;
}

export function scoreOtherStory(
  storyText: string,
  challengeTitle: string,
  originalPrompt: string
): StoryScoringResult {
  const text = storyText.toLowerCase();
  const titleWords = challengeTitle.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const promptWords = originalPrompt.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  const funnyHits = (text.match(/\b(funny|joke|laugh|absurd|silly|ridiculous|chaos|oops|pun|giggle|hilarious)\b/g) ?? []).length;
  const creativityHits = (text.match(/\b(creative|unexpected|twist|clever|surprising|wild|strange|oddball|inventive|impossible)\b/g) ?? []).length;
  const surpriseHits = (text.match(/\b(unexpected|twist|suddenly|then|however|but|reveal|realized|suddenly|shock|surprise)\b/g) ?? []).length;

  const challengeMatches = titleWords.filter((word) => text.includes(word)).length;
  const promptMatches = promptWords.filter((word) => text.includes(word)).length;

  const funny = Math.min(10, 3 + funnyHits * 0.8 + (text.length > 80 ? 1.5 : 0));
  const creativity = Math.min(10, 2.5 + creativityHits * 0.9 + (surpriseHits > 0 ? 1.5 : 0));
  const surprise = Math.min(10, 2 + surpriseHits * 0.7 + (text.includes("but") || text.includes("however") ? 1.2 : 0));
  const challengeFit = Math.min(10, 2 + challengeMatches * 0.7 + promptMatches * 0.35);

  const overall = Math.min(
    10,
    (funny * 0.35 + creativity * 0.25 + surprise * 0.2 + challengeFit * 0.2)
  );

  let summary = "A solid story with room for more punch.";
  if (overall >= 9) summary = "Excellent comedic timing and a strong challenge fit.";
  else if (overall >= 8) summary = "Very strong story with memorable turns and good payoff.";
  else if (overall >= 7) summary = "A fun, readable story that mostly lands its premise.";
  else if (overall >= 5) summary = "Promising material, but it needs sharper escalation or a stronger punchline.";

  return {
    funny: Number(funny.toFixed(1)),
    creativity: Number(creativity.toFixed(1)),
    surprise: Number(surprise.toFixed(1)),
    challengeFit: Number(challengeFit.toFixed(1)),
    overall: Number(overall.toFixed(1)),
    summary
  };
}

// STEP 1: Extract Premise from User Prompt
export function extractPremise(
  userPrompt: string,
  themePremise: string
): Premise {
  const text = userPrompt.toLowerCase();

  // Extract protagonist (character or entity)
  let protagonist = "someone";
  const nameMatch = userPrompt.match(/\b[A-Z][a-z]{2,15}\b/);
  if (nameMatch) protagonist = nameMatch[0];

  // Common protagonist patterns
  const protagonistPatterns: Array<[RegExp, string]> = [
    [/\b(robot|android|ai)\b/i, "a robot"],
    [/\b(cat|dog|pet|animal|puppy|kitten|parrot)\b/i, "a cat"],
    [/\b(alien|extraterrestrial|martian)\b/i, "an alien"],
    [/\b(grandma|grandpa|grandmother|grandfather)\b/i, "a grandparent"],
    [/\b(wizard|witch|sorcerer|magician)\b/i, "a wizard"],
    [/\b(superhero|hero|villain)\b/i, "a superhero"],
    [/\b(student|teacher|professor)\b/i, "a student"],
    [/\b(wrestler)\b/i, "a wrestler"],
    [/\b(printer|machine|device|computer)\b/i, "a machine"]
  ];

  for (const [pattern, repl] of protagonistPatterns) {
    if (pattern.test(userPrompt)) {
      protagonist = repl;
      break;
    }
  }

  // Extract setting
  let setting = "an everyday place";
  const settingPatterns: Array<[RegExp, string]> = [
    [/\b(family dinner|dinner table|dinner)\b/i, "a family dinner"],
    [/\b(school|classroom|teacher)\b/i, "a school"],
    [/\b(mrt|train station|train)\b/i, "a train station"],
    [/\b(restaurant|cafe|diner|food court)\b/i, "a restaurant"],
    [/\b(office|workplace|work|company)\b/i, "a workplace"],
    [/\b(home|house|apartment)\b/i, "a home"],
    [/\b(beach|park|outdoor|garden|nature)\b/i, "an outdoor location"],
    [/\b(ring|arena|stadium|wrestling)\b/i, "a wrestling ring"],
    [/\b(parliament|congress|government|hall)\b/i, "a parliament"]
  ];

  for (const [pattern, value] of settingPatterns) {
    if (pattern.test(userPrompt)) {
      setting = value;
      break;
    }
  }

  // Extract conflict from the prompt
  let conflict = userPrompt;
  const firstSentenceMatch = userPrompt.match(/[^.!?]*[.!?]/);
  if (firstSentenceMatch) {
    conflict = firstSentenceMatch[0].replace(/[.!?]$/, "").trim();
  }
  if (conflict.length > 160) {
    conflict = conflict.slice(0, 160);
  }

  // Identify comedy mechanism
  let comedyMechanism = "absurdity";
  const mechanismPatterns: Array<[RegExp, string]> = [
    [/\b(literal|literally|takes everything|exact)\b/i, "literal interpretation"],
    [/\b(irony|ironic|opposite|backwards|reverse)\b/i, "irony"],
    [/\b(misunderstand|confused|confusion|wrong|mistaken)\b/i, "misunderstanding"],
    [/\b(escalat|chaos|disaster|goes wrong|spiral)\b/i, "escalating consequences"],
    [/\b(callback|reference|joke)\b/i, "callbacks"],
    [/\b(twist|unexpected|surprise|shocking)\b/i, "unexpected twist"],
    [/\b(exaggerat|extreme|absurd|ridiculous|silly)\b/i, "absurdity"]
  ];

  for (const [pattern, mechanism] of mechanismPatterns) {
    if (pattern.test(userPrompt)) {
      comedyMechanism = mechanism;
      break;
    }
  }

  return {
    protagonist,
    setting,
    premise: userPrompt,
    conflict,
    comedyMechanism
  };
}

// STEP 2: Generate Story Outline
export function generateOutline(premise: Premise): StoryOutline {
  const { protagonist, setting, conflict, comedyMechanism } = premise;

  const hook = generateHook(protagonist, setting);
  const setup = generateSetup(protagonist, conflict, comedyMechanism);
  const problem = generateProblem(protagonist, comedyMechanism);
  const escalation1 = generateEscalation(1);
  const escalation2 = generateEscalation(2);
  const twist = generateTwist(protagonist, comedyMechanism);
  const punchline = generatePunchline(protagonist, setting);

  return {
    hook,
    setup,
    problem,
    escalation1,
    escalation2,
    twist,
    punchline
  };
}

function generateHook(protagonist: string, setting: string): string {
  const hooks = [
    `${protagonist} arrived at ${setting}.`,
    `It all started when ${protagonist} went to ${setting}.`,
    `Nobody expected ${protagonist} to show up at ${setting}.`,
    `${protagonist} thought this would be simple.`,
    `${protagonist} had a plan.`
  ];
  return hooks[Math.floor(Math.random() * hooks.length)];
}

function generateSetup(protagonist: string, conflict: string, comedyMechanism: string): string {
  if (comedyMechanism.includes("literal")) {
    return `${protagonist} took everything absolutely literally.`;
  }
  if (comedyMechanism.includes("misunderstand")) {
    return `${protagonist} had completely misunderstood the situation.`;
  }
  const setups = [
    `The plan seemed straightforward.`,
    `Everything appeared normal at first.`,
    `${protagonist} felt confident about what was happening.`,
    `Nobody anticipated what would happen next.`,
    `The situation seemed manageable.`
  ];
  return setups[Math.floor(Math.random() * setups.length)];
}

function generateProblem(protagonist: string, comedyMechanism: string): string {
  if (comedyMechanism.includes("literal")) {
    return `Then things got complicated because of ${protagonist}'s interpretation.`;
  }
  if (comedyMechanism.includes("misunderstand")) {
    return `Nobody understood what was really happening.`;
  }
  const problems = [
    `Then the problems started.`,
    `But something unexpected happened.`,
    `That's when things shifted.`,
    `One mistake cascaded into another.`,
    `Nobody had prepared for what came next.`
  ];
  return problems[Math.floor(Math.random() * problems.length)];
}

function generateEscalation(level: number): string {
  if (level === 1) {
    const escalations = [
      `The situation began to spiral out of control.`,
      `What started small became increasingly complicated.`,
      `Things got worse by the second.`,
      `Everyone started panicking.`,
      `The chaos multiplied.`
    ];
    return escalations[Math.floor(Math.random() * escalations.length)];
  }
  const escalations = [
    `Just when things seemed bad, they got significantly worse.`,
    `A second crisis emerged, doubling the chaos.`,
    `The situation reached its peak absurdity.`,
    `Everything came to a critical head.`,
    `The situation became completely out of hand.`
  ];
  return escalations[Math.floor(Math.random() * escalations.length)];
}

function generateTwist(protagonist: string, comedyMechanism: string): string {
  if (comedyMechanism.includes("literal")) {
    return `The only issue was that ${protagonist} was technically correct.`;
  }
  if (comedyMechanism.includes("misunderstand")) {
    return `The real twist was that nobody had been on the same page.`;
  }
  const twists = [
    `Then came the revelation nobody expected.`,
    `But there was one thing ${protagonist} hadn't realized.`,
    `The twist was that the solution had been obvious all along.`,
    `Somehow, the answer was the complete opposite of what everyone thought.`,
    `And that's when everything made sense.`
  ];
  return twists[Math.floor(Math.random() * twists.length)];
}

function generatePunchline(protagonist: string, setting: string): string {
  const settingName = setting.replace(/^a(n)?\s/, "").toLowerCase();
  const punchlines = [
    `And that's why ${settingName} has a new rule now.`,
    `${protagonist} has never been invited back to ${setting}.`,
    `By the end of the day, this story had spread everywhere.`,
    `Nobody has ever explained to ${protagonist} what actually happened.`,
    `And somehow, this all became someone else's problem.`,
    `The next day, nobody mentioned it ever again.`,
    `Ironically, everyone acted like it was completely normal.`,
    `And ${protagonist} learned absolutely nothing from the experience.`
  ];
  return punchlines[Math.floor(Math.random() * punchlines.length)];
}

// STEP 3: Generate Story Text from Outline
export function generateStoryFromOutline(
  outline: StoryOutline,
  wordLimit: number = 200
): string {
  const baseStory = `${outline.hook}

${outline.setup}

${outline.problem}

${outline.escalation1}

${outline.escalation2}

${outline.twist}

${outline.punchline}`;

  const words = baseStory.trim().split(/\s+/);
  let story = baseStory;

  if (words.length > wordLimit) {
    const targetWords = Math.floor(wordLimit * 0.85);
    const punchlineWords = outline.punchline.split(/\s+/);
    const maxMainContent = Math.max(50, targetWords - punchlineWords.length - 2);

    const mainContent = words.slice(0, maxMainContent).join(" ");
    story = mainContent + "\n\n" + outline.punchline;
  }

  return story.trim();
}

// STEP 4: Validate Story Quality
export function evaluateStoryQuality(
  story: string,
  prompt: string,
  premise: Premise,
  outline: StoryOutline
): QualityScore {
  const storyLower = story.toLowerCase();

  // Check for premise drift
  const premiseKeywords = extractKeywords(premise);
  const matchedKeywords = premiseKeywords.filter((kw) =>
    storyLower.includes(kw.toLowerCase())
  );
  const relevance = Math.min(
    10,
    Math.max(3, (matchedKeywords.length / Math.max(1, premiseKeywords.length)) * 10)
  );

  // Check for logical flow
  const hasProblems = /\b(problem|issue|situation|chaos|unexpected)\b/i.test(story);
  const hasEscalation = /\b(worse|escalat|spiral|complicate|crisis|chaos)\b/i.test(story) ||
    story.split(/[\.\n]+/).length > 5;
  const logicFlow = hasProblems && hasEscalation ? 9 : hasProblems ? 7 : 5;

  // Check consistency
  const settingKeywords = premise.setting.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const settingMentions = settingKeywords.filter((kw) => storyLower.includes(kw)).length;
  const settingConsistency = settingMentions > 0 ? 8 : settingKeywords.length === 0 ? 5 : 3;

  const protagonistMentions = (storyLower.match(
    new RegExp("\\b" + premise.protagonist.toLowerCase().replace(/\s+/g, "\\b|\\b") + "\\b", "g")
  ) || []).length;
  const characterConsistency = protagonistMentions > 0 ? 8 : 3;

  // Check for humor
  const hasHumor = /\b(absurd|ridiculous|silly|chaos)\b/i.test(story);
  const hasSurprise = /\b(unexpect|surprising|twist|irony|opposite)\b/i.test(story);
  const humour = hasHumor || hasSurprise ? 7 : 4;

  // Check escalation
  const sentences = story.split(/[.!?]+/).filter((s) => s.trim());
  const escalationLines = sentences.filter((s) =>
    /\b(worse|bigger|escalat|spiral|chaos|crisis|disaster)\b/i.test(s)
  );
  const escalation = escalationLines.length >= 2 ? 8 : escalationLines.length === 1 ? 6 : 3;

  // Check punchline
  const lines = story.trim().split(/[\n]+/);
  const lastLine = lines[lines.length - 1] || "";
  const lastLineWords = lastLine.split(/\s+/).length;
  const punchlineStrength = lastLineWords > 4 && lastLineWords < 25 && lastLine.length > 12 ? 8 : 5;

  // Check ending quality
  const hasStrongEnding = /\b(finally|eventually|end|conclusion|moral|learned)\b/i.test(lastLine) ||
    lastLine.includes(".");
  const endingQuality = hasStrongEnding ? 8 : 5;

  const overall = Math.min(
    10,
    (relevance + logicFlow + settingConsistency + characterConsistency + humour +
      escalation + punchlineStrength + endingQuality) / 8
  );

  return {
    relevance,
    logicFlow,
    settingConsistency,
    characterConsistency,
    humour,
    escalation,
    punchlineStrength,
    endingQuality,
    overall
  };
}

function extractKeywords(premise: Premise): string[] {
  const keywords = [
    ...premise.protagonist.split(/\s+/),
    ...premise.setting.split(/\s+/),
    ...premise.conflict.split(/\s+/).slice(0, 5)
  ].filter((w) => w.length > 2);

  return [...new Set(keywords)];
}

// STEP 5: Validation Rules
export function validatePremise(
  prompt: string,
  premise: Premise
): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  const promptLower = prompt.toLowerCase();

  // Check for unrelated workplace themes
  const hasWorkplaceKeywords = /\b(manager|meeting|office|productivity|overtime|whatsapp|committee|corporate|workplace|email|sop|report)\b/i.test(promptLower);
  const hasWorkplaceTheme = /\b(office|work|workplace|manager|meeting)\b/i.test(
    premise.setting.toLowerCase() + " " + premise.protagonist.toLowerCase()
  );

  if (!hasWorkplaceKeywords && hasWorkplaceTheme) {
    issues.push("Story contains workplace themes not requested in the prompt.");
  }

  // Check for exposure of internal instructions
  if (/\b(system|instruction|prompt|generate|template|internal)\b/i.test(premise.premise)) {
    issues.push("Potential instruction leakage detected.");
  }

  // Check for minimum coherence
  if (premise.protagonist.length < 3 || premise.setting.length < 3 || premise.conflict.length < 10) {
    issues.push("Premise extraction failed to capture key elements.");
  }

  return { isValid: issues.length === 0, issues };
}

// Full Generation Pipeline
export function generateStory(
  userPrompt: string,
  themePremise: string,
  wordLimit: number = 200,
  maxAttempts: number = 3
): StoryGenerationResult {
  let currentAttempt = 0;
  let bestResult: StoryGenerationResult | null = null;
  let bestScore = 0;

  while (currentAttempt < maxAttempts) {
    const premise = extractPremise(userPrompt, themePremise);
    const validation = validatePremise(userPrompt, premise);

    if (!validation.isValid && currentAttempt === maxAttempts - 1) {
      return {
        text: "The story generator encountered an issue with the premise.",
        outline: generateOutline(premise),
        qualityScore: {
          relevance: 0,
          logicFlow: 0,
          settingConsistency: 0,
          characterConsistency: 0,
          humour: 0,
          escalation: 0,
          punchlineStrength: 0,
          endingQuality: 0,
          overall: 0
        },
        needsRegeneration: true,
        issues: validation.issues
      };
    }

    const outline = generateOutline(premise);
    const text = generateStoryFromOutline(outline, wordLimit);
    const qualityScore = evaluateStoryQuality(text, userPrompt, premise, outline);

    const result: StoryGenerationResult = {
      text,
      outline,
      qualityScore,
      needsRegeneration:
        qualityScore.overall < 5.5 ||
        (qualityScore.relevance < 4 && currentAttempt < maxAttempts - 1) ||
        validation.issues.length > 0,
      issues: validation.issues
    };

    if (qualityScore.overall > bestScore) {
      bestScore = qualityScore.overall;
      bestResult = result;
    }

    if (!result.needsRegeneration) {
      return result;
    }

    currentAttempt++;
  }

  return (
    bestResult || {
      text: "Unable to generate story after multiple attempts.",
      outline: {
        hook: "",
        setup: "",
        problem: "",
        escalation1: "",
        escalation2: "",
        twist: "",
        punchline: ""
      },
      qualityScore: {
        relevance: 0,
        logicFlow: 0,
        settingConsistency: 0,
        characterConsistency: 0,
        humour: 0,
        escalation: 0,
        punchlineStrength: 0,
        endingQuality: 0,
        overall: 0
      },
      needsRegeneration: true,
      issues: ["Generation failed after maximum attempts."]
    }
  );
}