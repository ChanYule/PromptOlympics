import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("complete live event, response-loss recovery, polling, final results and responsive layouts", async ({
  browser,
}) => {
  const adminContext = await browser.newContext(),
    authorContext = await browser.newContext(),
    voterContext = await browser.newContext({ hasTouch: true });
  const admin = await adminContext.newPage(),
    author = await authorContext.newPage(),
    voter = await voterContext.newPage();
  await admin.goto("/admin");
  await admin.getByLabel("Organiser password").fill("wrong");
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(admin.getByRole("alert")).toContainText("incorrect");
  await admin.getByLabel("Organiser password").fill("browser-test-password-16");
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "Organiser Dashboard" }),
  ).toBeVisible();
  admin.on("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: "Start / Open submissions" }).click();
  await expect(admin.locator(".round-status")).toContainText(
    "Story creation is open",
  );
  await admin.getByLabel("Minimum votes for awards").fill("1");
  await admin.getByRole("button", { name: "Save rules" }).click();
  await author.goto("/");
  await expect(
    author.getByRole("heading", { name: "Turn your idea into a funny story." }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page: author })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await author.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await author.goto("/play");
  await author.getByLabel("1. What name").fill("Alice");
  await author.getByLabel("2. What happens").fill("A robot cooks noodles.");
  expect(
    (
      await new AxeBuilder({ page: author })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  // Server accepts the job, but the response is lost. Same operation is recovered on reload.
  let lostGeneration = false;
  await author.route("**/api/generate-story", async (route) => {
    if (!lostGeneration) {
      lostGeneration = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await author
    .getByRole("button", { name: "Create and save my story" })
    .click();
  await expect(
    author.getByRole("button", { name: "Check and retry the same request" }),
  ).toBeVisible();
  await author.reload();
  await expect(author.getByText("Saved to the competition")).toBeVisible();
  await expect(author.getByText("AI score:")).toBeVisible();
  await author.getByRole("button", { name: "Create another version" }).click();
  await expect(author.getByText("Saved to the competition")).toBeVisible();
  await expect(author.getByText("AI score:")).toBeVisible();
  await admin
    .getByRole("button", { name: "Close submissions", exact: true })
    .click();
  await expect(
    admin.getByRole("button", { name: "Open public voting" }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Open public voting" }).click();
  await expect(admin.locator(".round-status")).toContainText(
    "Public voting is open",
  );
  await author.goto("/vote");
  await author
    .getByRole("button", { name: /Alice.*The Unlikely Chef/ })
    .first()
    .click();
  await expect(author.getByLabel("5 stars: Loved it")).toBeEnabled();
  await voter.goto("/vote");
  await voter
    .getByRole("button", { name: /Alice.*The Unlikely Chef/ })
    .first()
    .tap();
  await voter.getByLabel("5 stars: Loved it").tap();
  await voter.getByLabel("5 stars: Loved it").press("ArrowLeft");
  await expect(voter.getByLabel("4 stars: Funny")).toBeChecked();
  await voter.getByLabel("4 stars: Funny").press("ArrowRight");
  await expect(voter.getByLabel("5 stars: Loved it")).toBeChecked();
  expect(
    (
      await new AxeBuilder({ page: voter })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  let lostVote = false;
  await voter.route("**/api/votes", async (route) => {
    if (!lostVote) {
      lostVote = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await voter.getByRole("button", { name: "Submit Vote" }).click();
  await expect(
    voter.getByRole("button", { name: "Check and confirm my vote" }),
  ).toBeVisible();
  await voter
    .getByRole("button", { name: "Check and confirm my vote" })
    .click();
  await expect(
    voter.getByText("Your vote is recorded. Thank you!"),
  ).toBeVisible();
  await voter.getByRole("button", { name: "Read Next Story" }).click();
  await voter.getByLabel("4 stars: Funny").check();
  await voter.getByRole("button", { name: "Submit Vote" }).click();
  await expect(
    voter.getByText("Your vote is recorded. Thank you!"),
  ).toBeVisible();
  await voter.getByRole("button", { name: "Next voter", exact: true }).click();
  await expect(
    voter.getByText("Ready for the next voter.", { exact: true }),
  ).toBeVisible();
  await voter
    .getByRole("button", { name: /Alice.*The Unlikely Chef/ })
    .first()
    .click();
  await expect(voter.getByLabel("5 stars: Loved it")).toBeEnabled();
  await voter.getByLabel("5 stars: Loved it").check();
  await voter.getByRole("button", { name: "Submit Vote", exact: true }).click();
  await expect(
    voter.getByText("Your vote is recorded. Thank you!"),
  ).toBeVisible();
  await voter.clock.install();
  await voter.goto("/leaderboard");
  await expect(voter.getByRole("table")).toBeVisible();
  await expect(voter.getByRole("table")).toContainText("4.69");
  expect(
    (
      await new AxeBuilder({ page: voter })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  // Virtual browser time exercises the real polling hook without a one-minute wall-clock wait.
  let refreshes = 0;
  voter.on("request", (r) => {
    if (r.url().includes("/api/leaderboard")) refreshes++;
  });
  await voter.clock.fastForward(65000);
  await expect.poll(() => refreshes).toBeGreaterThan(0);
  await voter.route("**/api/leaderboard", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary outage" }),
    }),
  );
  await voter.getByRole("button", { name: "Refresh now" }).click();
  await expect(
    voter.getByText("The last confirmed rankings remain visible."),
  ).toBeVisible();
  await expect(voter.getByRole("table")).toContainText("4.69");
  await voter.unroute("**/api/leaderboard");
  await voter.getByRole("button", { name: "Refresh now" }).click();
  await expect(voter.getByText("Temporary outage")).toHaveCount(0);
  await voter.getByRole("button", { name: "Present fullscreen" }).click();
  await expect(voter.locator(".projector")).toBeVisible();
  await voter.getByRole("button", { name: "Exit presentation" }).click();
  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [1366, 768],
  ]) {
    await voter.setViewportSize({ width, height });
    await expect
      .poll(() =>
        voter.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await voter.screenshot({
      path: `test-results/leaderboard-${width}.png`,
      fullPage: true,
    });
  }
  await voter.getByRole("button", { name: "Aa Larger text" }).click();
  await expect
    .poll(() =>
      voter.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await admin
    .getByRole("button", { name: "Close voting & Publish results" })
    .click();
  await expect(admin.locator(".round-status")).toContainText(
    "Final results published",
  );
  await voter.getByRole("button", { name: "Refresh now" }).click();
  await expect(
    voter.getByRole("heading", { name: "Final Results" }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Sign out" }).click();
  await expect(
    admin.getByRole("heading", { name: "Manage the event" }),
  ).toBeVisible();
  await adminContext.close();
  await authorContext.close();
  await voterContext.close();
});
