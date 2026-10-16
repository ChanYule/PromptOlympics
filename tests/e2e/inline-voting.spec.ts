import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("compact discovery opens full stories and preserves independent ratings without premature confirmation", async ({
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
  await expect(page.locator(".discovery-card")).toHaveCount(2);
  await expect(page.locator(".story-text")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Read and Vote", exact: false })
    .first()
    .click();
  const reader = page.locator(".focused-story");
  await expect(reader.locator(".story-text")).toHaveText(stories[0].resultText);
  await expect(
    page.getByRole("heading", { name: stories[0].title }),
  ).toBeFocused();
  await expect(
    reader.getByRole("button", { name: "Select a rating to continue" }),
  ).toBeDisabled();
  await reader.getByLabel("5 stars: Loved it").check();
  await page.getByRole("button", { name: "\u4e2d\u6587", exact: true }).click();
  await expect(reader.locator("input[value='5']")).toBeChecked();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await reader
    .getByRole("button", { name: "Back to stories", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Read and Vote", exact: false }).first(),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Read and Vote", exact: false })
    .nth(1)
    .click();
  await reader.getByLabel("3 stars: Enjoyable").check();
  await reader
    .getByRole("button", { name: "Submit My Vote", exact: true })
    .click();
  await expect(
    page.getByText("Your vote is recorded. Thank you!", { exact: true }),
  ).toHaveCount(0);
  await expect(
    reader.getByRole("button", {
      name: "Submitting your vote...",
      exact: true,
    }),
  ).toBeDisabled();
  release();
  await expect(
    reader.getByText("Your vote is recorded. Thank you!", { exact: true }),
  ).toBeVisible();
  await reader
    .getByRole("button", { name: "Read Another Story", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read and Vote", exact: false })
    .first()
    .click();
  await expect(reader.getByLabel("5 stars: Loved it")).toBeChecked();
  await reader
    .getByRole("button", { name: "Submit My Vote", exact: true })
    .dblclick();
  await expect(
    reader.getByText("Your vote is recorded. Thank you!", { exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([
    { submissionId: "second", rating: 3 },
    { submissionId: "first", rating: 5 },
  ]);
  await page.reload();
  await expect(page.getByText("Vote Recorded", { exact: true })).toHaveCount(2);
  await page
    .getByRole("button", { name: "Read and Vote", exact: false })
    .first()
    .click();
  await expect(reader.getByLabel("5 stars: Loved it")).toBeDisabled();
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(reader.locator(".story-text")).toHaveText(
      stories[0].resultText,
    );
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "reports/redesign-reader-mobile.png",
    fullPage: true,
  });
});
