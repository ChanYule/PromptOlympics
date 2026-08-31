// Test file for story generation pipeline
// This verifies the new implementation against the test cases

import {
  generateStory,
  extractPremise,
  generateOutline,
  generateStoryFromOutline,
  evaluateStoryQuality,
  validatePremise
} from "./storyGeneration";

interface TestCase {
  name: string;
  prompt: string;
  themePremise: string;
}

const testCases: TestCase[] = [
  {
    name: "Robot literal interpretation",
    prompt: "A robot attends a family dinner and takes everything literally.",
    themePremise: "A robot attends a family dinner and takes everything literally."
  },
  {
    name: "Grandmother wrestler",
    prompt: "A grandmother becomes a professional wrestler.",
    themePremise: "A grandmother becomes a professional wrestler."
  },
  {
    name: "Cat president",
    prompt: "A cat accidentally becomes the president.",
    themePremise: "A cat accidentally becomes the president."
  },
  {
    name: "Student dinosaur homework",
    prompt: "A student tries to convince their teacher that their homework was eaten by a dinosaur.",
    themePremise: "A student tries to convince their teacher that their homework was eaten by a dinosaur."
  },
  {
    name: "Superhero sandwich maker",
    prompt: "A superhero's only superpower is being extremely good at making sandwiches.",
    themePremise: "A superhero's only superpower is being extremely good at making sandwiches."
  }
];

function runTests() {
  console.log("=== STORY GENERATION PIPELINE TEST ===\n");

  testCases.forEach((testCase) => {
    console.log(`\n📝 TEST: ${testCase.name}`);
    console.log(`Prompt: "${testCase.prompt}"\n`);

    try {
      // Step 1: Extract premise
      const premise = extractPremise(testCase.prompt, testCase.themePremise);
      console.log("✓ Step 1 - Premise Extraction:");
      console.log(`  Protagonist: ${premise.protagonist}`);
      console.log(`  Setting: ${premise.setting}`);
      console.log(`  Comedy Mechanism: ${premise.comedyMechanism}`);

      // Step 2: Validate premise
      const validation = validatePremise(testCase.prompt, premise);
      console.log(
        `\n✓ Step 2 - Validation: ${validation.isValid ? "PASSED" : "FAILED"}`
      );
      if (!validation.isValid) {
        console.log(`  Issues: ${validation.issues.join(", ")}`);
      }

      // Step 3: Generate story using full pipeline
      const result = generateStory(testCase.prompt, testCase.themePremise, 200, 3);

      console.log(`\n✓ Step 3 - Story Generated`);
      console.log(`  Quality Score: ${result.qualityScore.overall.toFixed(2)}/10`);
      console.log(`  Relevance: ${result.qualityScore.relevance.toFixed(2)}`);
      console.log(`  Logic Flow: ${result.qualityScore.logicFlow.toFixed(2)}`);
      console.log(
        `  Setting Consistency: ${result.qualityScore.settingConsistency.toFixed(2)}`
      );
      console.log(
        `  Character Consistency: ${result.qualityScore.characterConsistency.toFixed(2)}`
      );
      console.log(`  Humour: ${result.qualityScore.humour.toFixed(2)}`);
      console.log(`  Escalation: ${result.qualityScore.escalation.toFixed(2)}`);
      console.log(
        `  Punchline Strength: ${result.qualityScore.punchlineStrength.toFixed(2)}`
      );
      console.log(
        `  Ending Quality: ${result.qualityScore.endingQuality.toFixed(2)}`
      );

      // Check for critical issues
      const checks = {
        "Has protagonist": result.text.includes(premise.protagonist),
        "Has setting": result.text.includes(
          premise.setting.replace("a ", "").replace("an ", "")
        ),
        "Has escalation": /\b(worse|escalat|spiral|chaos|crisis)\b/i.test(
          result.text
        ),
        "Has punchline": result.text.split(/[\n]+/).slice(-1)[0]?.length > 10,
        "No instruction leakage": !/\b(instruction|system|prompt|generate|template)\b/i.test(
          result.text
        ),
        "No unrelated workplace": !/\b(manager|meeting|whatsapp|committee|workplace|sop)\b/i.test(
          testCase.prompt
        )
          ? true
          : !/\b(manager|meeting|whatsapp|committee|office|sop)\b/i.test(
            result.text
          ),
        "Word limit respected": result.text.split(/\s+/).length <= 205
      };

      console.log(`\n✓ Step 4 - Quality Checks:`);
      Object.entries(checks).forEach(([check, passed]) => {
        console.log(`  ${passed ? "✅" : "❌"} ${check}`);
      });

      console.log(`\n📖 Generated Story:\n`);
      console.log(result.text);
      console.log(`\n${"-".repeat(70)}`);
    } catch (error) {
      console.log(`\n❌ ERROR: ${error}`);
      console.log(`${"-".repeat(70)}`);
    }
  });
}

// Export for use in Node or browser environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = { runTests };
}

// Run tests if this file is executed directly
if (typeof window === "undefined") {
  runTests();
}
