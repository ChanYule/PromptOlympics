import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("big screen rotates full stories, preserves the current story across ranking refreshes, and keeps results on errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const text =
    "Alice brought a sandwich to the community fair. She put it on a chair and went to find a drink. When she returned, the sandwich was wearing her name badge. A volunteer had mistaken it for a new helper and assigned it to the welcome desk. Alice asked whether it had been useful. The volunteer said it was quiet but excellent at filling a role. By lunchtime it had received three thank-you cards, a certificate, and a promotion. Alice finally understood why the organiser kept calling it an outstanding member of staff.";
  const entries = ["A", "B", "C"].map((id, i) => ({
    submissionId: id,
    title: "Story " + id,
    participantName: "Author " + id,
    aiScore: 4,
    averageScore: 5 - i / 10,
    finalScore: 4.5 - i / 20,
    voteCount: 6,
    eligible: true,
    judgingStatus: "ready",
  }));
  let rows = entries,
    outage = false;
  await page.route("**/api/leaderboard", (r) =>
    r.fulfill(
      outage
        ? { status: 503, json: { error: "Temporary outage" } }
        : {
            json: {
              round: {
                id: "r",
                roundNumber: 1,
                state: "SUBMISSIONS_OPEN",
                minVotes: 1,
              },
              entries: rows,
              final: false,
            },
          },
    ),
  );
  const bodyRequests: string[] = [];
  await page.route("**/api/leaderboard/story/*", (r) => {
    bodyRequests.push(r.request().url());
    return r.fulfill({ json: { story: text } });
  });
  await page.clock.install();
  await page.goto("/leaderboard");
  const stories = page.getByRole("region", {
    name: "Stories on the leaderboard",
    exact: true,
  });
  await expect(stories.getByRole("article")).toHaveCount(1);
  await expect(
    stories.getByRole("article").first().locator(".story-text"),
  ).toHaveText(text);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "排行榜上的故事", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page
    .getByRole("button", { name: "Presentation Mode", exact: true })
    .click();
  const screen = page.locator(".projector"),
    spotlight = screen.locator(".spotlight-story");
  await expect(
    spotlight.getByRole("heading", { name: "Story A", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause story rotation", exact: true })
    .click();
  await page.clock.fastForward(46000);
  await expect(
    spotlight.getByRole("heading", { name: "Story A", exact: true }),
  ).toBeVisible();
  rows = [
    { ...entries[1], aiScore: 4.8, finalScore: 4.85 },
    entries[0],
    entries[2],
  ];
  await page.clock.fastForward(60001);
  await expect(
    spotlight.getByText("Rank 2 · A story by Author A", { exact: true }),
  ).toBeVisible();
  expect(bodyRequests).toHaveLength(1);
  await page
    .getByRole("button", { name: "Resume story rotation", exact: true })
    .click();
  await page.clock.fastForward(45000);
  await expect(
    spotlight.getByRole("heading", { name: "Story C", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previous story", exact: true })
    .click();
  await expect(
    spotlight.getByRole("heading", { name: "Story A", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause story rotation", exact: true })
    .click();
  outage = true;
  await page.clock.fastForward(60001);
  await expect(
    page.getByText(
      "Connection interrupted. Showing the last confirmed rankings.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(
    spotlight.getByRole("heading", { name: "Story A", exact: true }),
  ).toBeVisible();
  expect(await screen.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  const bounds = await spotlight.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1080);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  outage = false;
  await page.clock.fastForward(60001);
  await expect(page.getByText("Temporary outage", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: "reports/leaderboard-big-screen.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Exit Presentation", exact: true })
    .click();
  await expect(stories.getByRole("article")).toHaveCount(1);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
