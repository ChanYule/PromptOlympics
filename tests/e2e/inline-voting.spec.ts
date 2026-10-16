import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("full stories and independent ratings are available directly on every card", async ({
  page,
}) => {
  const stories = [
    {
      id: "first",
      participantName: "Alice",
      title: "The Lost Sandwich",
      prompt: "Lunch",
      resultText:
        "Alice brought a sandwich to the community fair. She put it on a chair and went to find a drink. When she returned, the sandwich was wearing her name badge. A volunteer had mistaken it for a new helper and assigned it to the welcome desk. Alice asked whether it had been useful. The volunteer said it was quiet but excellent at filling a role. By lunchtime it had received three thank-you cards, a certificate, and a promotion. Alice finally understood why the organiser kept calling it an outstanding member of staff.",
    },
    {
      id: "second",
      participantName: "Bob",
      title: "The Helpful Robot",
      prompt: "Robot",
      resultText:
        "The robot offered to make tea. It read the instructions twice, warmed the pot, and carefully arranged the cups. When Bob asked for a little more body, it proudly brought another robot.",
    },
  ];
  const votes = new Map<string, number>(),
    requests: Array<{ submissionId: string; rating: number }> = [];
  let release: () => void = () => {};
  const acknowledged = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/competition", (r) =>
    r.fulfill({
      json: {
        id: "r",
        state: "SUBMISSIONS_OPEN",
        roundNumber: 1,
        allowSelfVotes: true,
        boothMode: false,
      },
    }),
  );
  await page.route("**/api/stories?*", (r) =>
    r.fulfill({
      json: {
        items: stories.map((s) => ({
          ...s,
          voted: votes.has(s.id),
          rating: votes.get(s.id),
        })),
        hasMore: false,
      },
    }),
  );
  await page.route("**/api/votes", async (r) => {
    const input = r.request().postDataJSON();
    requests.push(input);
    if (input.submissionId === "second") await acknowledged;
    votes.set(input.submissionId, input.rating);
    await r.fulfill({ status: 201, json: { recorded: true } });
  });
  await page.goto("/vote");
  const first = page.getByRole("article", {
      name: stories[0].title,
      exact: true,
    }),
    second = page.getByRole("article", { name: stories[1].title, exact: true });
  await expect(first.locator(".story-text")).toHaveText(stories[0].resultText);
  await expect(second.locator(".story-text")).toHaveText(stories[1].resultText);
  await expect(
    page.getByRole("button", { name: "Read this story", exact: false }),
  ).toHaveCount(0);
  await first.getByLabel("5 stars: Loved it").check();
  await second.getByLabel("3 stars: Enjoyable").check();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(first.locator("input[value='5']")).toBeChecked();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await second
    .getByRole("button", { name: "Submit Vote", exact: true })
    .click();
  await expect(first.getByLabel("5 stars: Loved it")).toBeDisabled();
  await expect(
    page.getByText("Your vote is recorded. Thank you!", { exact: true }),
  ).toHaveCount(0);
  release();
  await expect(
    second.getByText("Your vote is recorded. Thank you!", { exact: true }),
  ).toBeVisible();
  await expect(first.getByLabel("5 stars: Loved it")).toBeChecked();
  await first
    .getByRole("button", { name: "Submit Vote", exact: true })
    .dblclick();
  await expect(
    first.getByText("Your vote is recorded. Thank you!", { exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([
    { submissionId: "second", rating: 3 },
    { submissionId: "first", rating: 5 },
  ]);
  await page.reload();
  await expect(
    first.getByText("Your 5-star vote is recorded.", { exact: true }),
  ).toBeVisible();
  await expect(
    second.getByText("Your 3-star vote is recorded.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit Vote", exact: true }),
  ).toHaveCount(0);
  for (const width of [375, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await first
        .locator(".story-text")
        .evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
    ).toBe(true);
    await page.screenshot({
      path: `reports/inline-voting-${width}.png`,
      fullPage: true,
    });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
