import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("three consecutive booth participants retain separate stories, scores and votes across reload and backend restart", async ({
  page,
  browser,
}) => {
  await page.request.post("/__test/fresh");
  const display = await browser.newPage();
  await page.goto("/admin");
  await page.getByLabel("Organiser password").fill("browser-test-password-16");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  page.on("dialog", (d) => d.accept());
  await page
    .getByLabel("Booth mode: allow voting while story creation is open")
    .check();
  await page.getByLabel("Allow participants to rate their own stories").check();
  await page.getByLabel("Minimum votes for awards").fill("1");
  await page.getByRole("button", { name: "Save rules" }).click();
  await page.getByRole("button", { name: "Start / Open submissions" }).click();
  await display.goto("/leaderboard");
  await page.goto("/booth");
  const participants = [
    [
      "Happy Panda",
      "A cat becomes the principal of a school.",
      "Principal Paws",
      5,
      "4.69",
    ],
    [
      "Funny Uncle",
      "An uncle accidentally becomes a famous K-pop dancer.",
      "The Dancing Uncle",
      4,
      "4.19",
    ],
    [
      "Super Chicken",
      "A chicken opens a five-star restaurant.",
      "Chef Chicken",
      3,
      "3.69",
    ],
  ] as const;
  const stories = [];
  for (const [name, prompt, title, rating, combined] of participants) {
    await expect(
      page.getByRole("button", {
        name: "Start Creating My Story",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Start Creating My Story", exact: true })
      .click();
    await expect(page.getByLabel("2. What happens")).toHaveValue("");
    await page.getByLabel("1. What name").fill(name);
    await page.getByLabel("2. What happens").fill(prompt);
    await page.getByRole("button", { name: "Generate My Story" }).dblclick();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    stories.push(await page.locator(".story-text").innerText());
    await expect(page.getByText("AI score:")).toBeVisible();
    await page
      .getByRole("radio", { name: `Rate ${rating} out of 5`, exact: true })
      .check();
    await page
      .getByRole("button", { name: "Submit My Vote", exact: true })
      .dblclick();
    await expect(
      page.getByText("Thank you! Your vote has been recorded.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(`Combined score: ${combined} / 5`, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Thank you! Your vote has been recorded.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit My Vote", exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page
      .getByRole("button", {
        name: "Finish and Start Next Participant",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "One idea. Your own funny story." }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        ["name", "prompt", "generation", "last-job", "pending-vote"].every(
          (k) => !sessionStorage.getItem(k),
        ),
      ),
    ).toBe(true);
  }
  expect(new Set(stories).size).toBe(3);
  await page.request.post("/__test/restart");
  await page.goto("/leaderboard");
  await display
    .getByRole("button", { name: "Refresh now", exact: true })
    .click();
  for (const target of [page, display]) {
    for (const [name, , title, , combined] of participants) {
      const row = target.getByRole("row").filter({ hasText: name });
      await expect(row).toContainText(title);
      await expect(row).toContainText(combined);
      await expect(row).toContainText("4.38");
      await expect(row.getByRole("cell").last()).toHaveText("1");
    }
  }
  await page.screenshot({
    path: "reports/booth-three-participants.png",
    fullPage: true,
  });
  await display.close();
  await page.request.post("/__test/fresh");
});

test("uncertain booth votes and participant resets reconcile without duplicate records", async ({
  page,
}) => {
  await page.request.post("/__test/fresh");
  await page.goto("/admin");
  await page.getByLabel("Organiser password").fill("browser-test-password-16");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  page.on("dialog", (d) => d.accept());
  await page
    .getByLabel("Booth mode: allow voting while story creation is open")
    .check();
  await page.getByRole("button", { name: "Save rules", exact: true }).click();
  await page
    .getByRole("button", { name: "Start / Open submissions", exact: true })
    .click();
  await page.goto("/booth");
  await page
    .getByRole("button", { name: "Start Creating My Story", exact: true })
    .click();
  await page
    .getByLabel("2. What happens")
    .fill("A cat becomes the principal of a school.");
  let lostStory = false;
  await page.route("**/api/generate-story", async (route) => {
    if (!lostStory) {
      lostStory = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Generate My Story", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check and retry the same request" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Principal Paws", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Rate 5 out of 5", exact: true })
    .check();
  let lostVote = false;
  await page.route("**/api/votes", async (route) => {
    if (!lostVote) {
      lostVote = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Submit My Vote", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Check and confirm my vote",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Finish and Start Next Participant",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Check and confirm my vote", exact: true })
    .click();
  await expect(
    page.getByText("Thank you! Your vote has been recorded.", { exact: true }),
  ).toBeVisible();
  let lostReset = false;
  await page.route("**/api/finish-participant", async (route) => {
    if (!lostReset) {
      lostReset = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", {
      name: "Finish and Start Next Participant",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry participant reset", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry participant reset", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "One idea. Your own funny story." }),
  ).toBeVisible();
  const data = await (await page.request.get("/api/admin/export")).json();
  expect(data.rounds[0].submissions).toHaveLength(1);
  expect(data.rounds[0].votes).toHaveLength(1);
  await page.request.post("/__test/fresh");
});

test("optional inactivity warning resets only idle booth input and never an active generation", async ({
  page,
}) => {
  await page.request.post("/__test/fresh");
  await page.goto("/booth");
  await page.clock.install();
  await page.getByText("Booth settings", { exact: true }).click();
  await page.getByLabel("Reset an inactive booth after a warning").check();
  await page
    .getByRole("button", { name: "Start Creating My Story", exact: true })
    .click();
  await page.getByLabel("2. What happens").fill("Unfinished idea");
  await page.clock.fastForward(121000);
  await expect(
    page.getByText("This booth will reset in 30 seconds unless you continue.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I am still here", exact: true })
    .click();
  await expect(page.getByLabel("2. What happens")).toHaveValue(
    "Unfinished idea",
  );
  await page.clock.fastForward(151000);
  await expect(
    page.getByRole("button", { name: "Start Creating My Story", exact: true }),
  ).toBeVisible();
  await page.route("**/api/competition", (r) =>
    r.fulfill({
      json: {
        id: "r",
        state: "SUBMISSIONS_OPEN",
        boothMode: true,
        roundNumber: 1,
      },
    }),
  );
  await page.route("**/api/generate-story", (r) =>
    r.fulfill({ json: { id: "waiting", status: "queued", submission: null } }),
  );
  await page.route("**/api/jobs/waiting", (r) =>
    r.fulfill({ json: { id: "waiting", status: "queued", submission: null } }),
  );
  await page
    .getByRole("button", { name: "Start Creating My Story", exact: true })
    .click();
  await page.getByLabel("2. What happens").fill("Robot soup");
  await page
    .getByRole("button", { name: "Generate My Story", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your story is on its way" }),
  ).toBeVisible();
  await page.clock.fastForward(160000);
  await expect(
    page.getByRole("heading", { name: "Your story is on its way" }),
  ).toBeVisible();
  await expect(
    page.getByText("This booth will reset in 30 seconds unless you continue.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.request.post("/__test/fresh");
});
