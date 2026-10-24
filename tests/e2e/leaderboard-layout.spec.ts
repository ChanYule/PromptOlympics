import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const sizes = [
  [1920, 1080],
  [1366, 768],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [390, 844],
];
const fullStory =
  Array.from(
    { length: 45 },
    (_, index) =>
      `Paragraph ${index + 1}. A robot visited the community fair, offered to wash the dishes, and accidentally became the chief of the entire washing committee. Everyone agreed its ideas were sparkling.\n\n`,
  ).join("") + "THE COMPLETE ENDING";
const entries = Array.from({ length: 45 }, (_, index) => ({
  submissionId: `s${index}`,
  title: `Story ${index + 1}: A surprising afternoon at the community fair`,
  participantName:
    index === 4
      ? "A participant with an unusually long nickname that should wrap safely"
      : `Author ${index + 1}`,
  aiScore: index === 44 ? null : 4.25,
  averageScore: index < 3 ? 4.5 : null,
  finalScore: index < 3 ? 4.375 : null,
  voteCount: index < 3 ? 7 : 0,
  eligible: index < 3,
  judgingStatus: index === 44 ? "pending" : "ready",
}));

for (const [width, height] of sizes) {
  test(`leaderboard and full reader fit ${width}x${height} with independent scrolling and synchronized selection`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() =>
      sessionStorage.setItem("slideshow-paused", "true"),
    );
    let rows = entries;
    const bodyRequests: string[] = [];
    await page.route("**/api/leaderboard", (route) =>
      route.fulfill({
        json: {
          round: {
            id: "layout",
            roundNumber: 1,
            state: "SUBMISSIONS_OPEN",
            minVotes: 5,
          },
          final: false,
          entries: rows,
        },
      }),
    );
    await page.route("**/api/leaderboard/story/*", (route) => {
      bodyRequests.push(route.request().url());
      return route.fulfill({ json: { story: fullStory } });
    });
    await page.goto("/leaderboard");
    const scores = page.locator(".lb-score-panel"),
      reader = page.locator(".lb-reader-panel");
    await expect(page.locator(".lb-row")).toHaveCount(45);
    const compact = width < 960;
    await expect(scores).toBeVisible();
    if (!compact) {
      await expect(reader).toBeVisible();
      const left = (await scores.boundingBox())!,
        right = (await reader.boundingBox())!;
      expect(left.x + left.width).toBeLessThanOrEqual(right.x);
      expect(Math.abs(left.height - right.height)).toBeLessThan(2);
      expect(left.width / (left.width + right.width)).toBeGreaterThan(0.36);
      expect(left.width / (left.width + right.width)).toBeLessThan(0.4);
      expect(
        Math.max(left.y + left.height, right.y + right.height),
      ).toBeLessThanOrEqual(height);
    } else {
      await expect(reader).toBeHidden();
      await expect(
        page.getByRole("tab", { name: "Leaderboard", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    }
    const pageSize = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(pageSize.width).toBeLessThanOrEqual(width);
    expect(pageSize.height).toBeLessThanOrEqual(height + 1);
    const firstTitle = page.locator(".lb-title button").nth(4);
    await firstTitle.focus();
    await firstTitle.press("Enter");
    await expect(
      reader.getByRole("heading", { name: entries[4].title, exact: true }),
    ).toBeVisible();
    await expect(reader.locator(".story-text")).toHaveText(fullStory);
    if (compact) {
      await expect(scores).toBeHidden();
      await expect(
        page.getByRole("tab", { name: "Read Story", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    }
    const content = reader.locator(".lb-story-scroll");
    const navigation = await reader.locator(".lb-reader-nav").boundingBox();
    expect(navigation!.y + navigation!.height).toBeLessThanOrEqual(height);
    const bodySize = await content.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      height: element.clientHeight,
    }));
    expect(bodySize.scrollHeight).toBeGreaterThan(bodySize.height);
    expect(bodySize.height, JSON.stringify(bodySize)).toBeGreaterThan(60);
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(content).toContainText("THE COMPLETE ENDING");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await reader.locator(".lb-reader-nav").boundingBox()).toEqual(
      navigation,
    );
    await reader
      .getByRole("button", { name: "Next story", exact: true })
      .click();
    await expect(
      reader.getByRole("heading", { name: entries[5].title, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => content.evaluate((element) => element.scrollTop))
      .toBe(0);
    await reader
      .getByRole("button", { name: "Previous story", exact: true })
      .click();
    await expect(
      reader.getByRole("heading", { name: entries[4].title, exact: true }),
    ).toBeVisible();
    const requestsBeforeRefresh = bodyRequests.length;
    rows = [
      { ...entries[4], voteCount: 3, averageScore: 4, finalScore: 4.125 },
      ...entries.filter((entry) => entry.submissionId !== "s4"),
    ];
    await page
      .getByRole("button", { name: "Refresh Now", exact: true })
      .click();
    await expect(reader.locator(".lb-reader-scores")).toContainText("4.13");
    await expect(
      reader.getByRole("heading", { name: entries[4].title, exact: true }),
    ).toBeVisible();
    expect(bodyRequests.length).toBe(requestsBeforeRefresh);
    if (compact)
      await page.getByRole("tab", { name: "Leaderboard", exact: true }).click();
    await expect(page.locator(".lb-row.is-selected")).toContainText(
      entries[4].participantName,
    );
    const scroll = scores.locator(".lb-score-scroll");
    const readerBounds = await reader.boundingBox();
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(
      await scroll.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(100);
    expect(await reader.boundingBox()).toEqual(readerBounds);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const header = scores.locator("table").last().locator("th").first();
    const headerBox = (await header.boundingBox())!,
      scrollBox = (await scroll.boundingBox())!;
    if (!compact) expect(headerBox.y).toBeGreaterThanOrEqual(scrollBox.y - 1);
    await scroll.evaluate((element) => {
      element.scrollTop = 0;
    });
    if (compact) {
      await page.screenshot({
        path: `reports/leaderboard-scores-${width}.png`,
        fullPage: true,
      });
      const tab = page.getByRole("tab", { name: "Leaderboard", exact: true });
      await tab.focus();
      await tab.press("ArrowRight");
      await expect(
        page.getByRole("tab", { name: "Read Story", exact: true }),
      ).toBeFocused();
      await page.getByRole("tab", { name: "Leaderboard", exact: true }).click();
    }
    await page.locator(".lb-title button").nth(1).click();
    await expect(
      reader.getByRole("heading", { name: entries[1].title, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `reports/leaderboard-compact-${width}.png`,
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}

test("Chinese stories use the resolved body language and missing, removed and empty entries recover", async ({
  page,
}) => {
  let rows = entries.slice(0, 2),
    missing = true;
  await page.route("**/api/leaderboard", (route) =>
    route.fulfill({
      json: {
        round: {
          id: "chinese",
          roundNumber: 1,
          state: "SUBMISSIONS_OPEN",
          minVotes: 5,
        },
        final: false,
        entries: rows,
      },
    }),
  );
  const text =
    "机器人来到社区中心，认真地把每一张椅子都排成了笑脸。大家笑着说，这是今天最好的座位安排。".repeat(
      80,
    ) + "故事完。";
  await page.route("**/api/leaderboard/story/*", (route) =>
    route.fulfill(
      missing ? { json: { story: null } } : { json: { story: text } },
    ),
  );
  await page.goto("/leaderboard");
  await expect(
    page.getByText("Story text is unavailable for this entry."),
  ).toBeVisible();
  missing = false;
  await page
    .getByRole("button", { name: "Retry connection", exact: true })
    .click();
  await expect(page.locator(".lb-story-scroll .story-text")).toHaveText(text);
  await expect(page.locator(".lb-story-scroll .story-text")).toHaveAttribute(
    "lang",
    "zh-Hans",
  );
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "阅读故事", exact: true }),
  ).toBeVisible();
  rows = [entries[1]];
  await page.getByRole("button", { name: "立即刷新", exact: true }).click();
  await expect(page.locator(".lb-reader-heading h3")).toHaveText(
    entries[1].title,
  );
  rows = [];
  await page.getByRole("button", { name: "立即刷新", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "尚未选择故事", exact: true }),
  ).toBeVisible();
});
