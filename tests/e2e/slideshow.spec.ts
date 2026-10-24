import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function setup(page: Page, width = 1366, height = 768) {
  await page.setViewportSize({ width, height });
  const entries = ["A", "B", "C"].map((id, index) => ({
    submissionId: id,
    participantName: `Author ${id}`,
    title: `Story ${id}`,
    aiScore: 4,
    averageScore: 4.5,
    finalScore: 4.25,
    voteCount: 7,
    eligible: index < 2,
    judgingStatus: "ready",
  }));
  let rows = entries;
  const bodies: string[] = [];
  await page.route("**/api/leaderboard", (route) =>
    route.fulfill({
      json: {
        round: {
          id: "slides",
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
    const id = route.request().url().split("/").at(-1)!;
    bodies.push(id);
    return route.fulfill({
      json: {
        story: `Complete story ${id}. A robot tried to run a community cafe and gave everyone an upgrade instead of a coffee.`,
      },
    });
  });
  const clockStart = new Date("2026-10-24T00:00:00Z");
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
  await page.goto("/leaderboard");
  const reader = page.locator(".lb-reader-panel");
  if (width < 960)
    await page.getByRole("tab", { name: "Read Story", exact: true }).click();
  async function current(id: string) {
    await expect(
      reader.getByRole("heading", { name: `Story ${id}`, exact: true }),
    ).toBeVisible();
    await expect(reader.locator(".story-text")).toContainText(
      `Complete story ${id}.`,
    );
    await expect(page.locator(".lb-row.is-selected")).toContainText(
      `Author ${id}`,
    );
  }
  await current("A");
  return {
    reader,
    current,
    bodies,
    reorder: () => {
      rows = [{ ...entries[0], voteCount: 8 }, entries[2], entries[1]];
    },
  };
}

test("eight-second slideshow loops, manual selection resets its timer, and pause and configurable playback persist", async ({
  page,
}) => {
  const { reader, current, bodies } = await setup(page);
  await expect(page.getByLabel("Change story every")).toHaveValue("8");
  await page.clock.fastForward(7999);
  await current("A");
  await page.clock.fastForward(1);
  await current("B");
  await page.clock.fastForward(8000);
  await current("C");
  await page.clock.fastForward(8000);
  await current("A");
  await page.clock.fastForward(7000);
  // Clicking the already-selected row must still restart the full interval.
  await page.locator(".lb-row.is-selected .lb-title button").click();
  await page.clock.fastForward(1000);
  await current("A");
  await page.clock.fastForward(7000);
  await current("B");
  await reader.getByRole("button", { name: "Next story", exact: true }).click();
  await current("C");
  await page.clock.fastForward(7999);
  await current("C");
  await page.clock.fastForward(1);
  await current("A");
  await reader
    .getByRole("button", { name: "Pause story rotation", exact: true })
    .click();
  await page.clock.fastForward(32000);
  await current("A");
  await reader.getByRole("button", { name: "Next story", exact: true }).click();
  await current("B");
  await page.clock.fastForward(16000);
  await current("B");
  await page.getByLabel("Change story every").selectOption("12");
  await reader
    .getByRole("button", { name: "Resume story rotation", exact: true })
    .click();
  await page.clock.fastForward(11999);
  await current("B");
  await page.clock.fastForward(1);
  await current("C");
  expect(bodies).toEqual(["A", "B", "C"]);
  await reader
    .getByRole("button", { name: "Pause story rotation", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Change story every")).toHaveValue("12");
  await expect(
    reader.getByRole("button", { name: "Resume story rotation", exact: true }),
  ).toBeVisible();
});

test("hidden tabs and reading settings suspend playback, score refreshes retain the timer, and navigation cleans up", async ({
  page,
}) => {
  const { reader, current, bodies, reorder } = await setup(page);
  await page.clock.fastForward(4000);
  reorder();
  await page.getByRole("button", { name: "Refresh Now", exact: true }).click();
  await expect(
    reader.locator(".lb-reader-scores > div:last-child dd"),
  ).toHaveText("8");
  await expect(
    reader.getByRole("heading", { name: "Story A", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(4000);
  await current("C");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    reader.getByRole("button", { name: "Resume story rotation", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(40000);
  await current("C");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    reader.getByRole("button", { name: "Pause story rotation", exact: true }),
  ).toBeEnabled();
  await page.clock.fastForward(8000);
  await current("B");
  await page
    .getByRole("button", { name: "Less movement", exact: true })
    .click();
  await expect(
    reader.getByRole("button", { name: "Resume story rotation", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(40000);
  await current("B");
  await page
    .getByRole("button", { name: "Less movement", exact: true })
    .click();
  await expect(
    reader.getByRole("button", { name: "Pause story rotation", exact: true }),
  ).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    reader.getByRole("button", { name: "Resume story rotation", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(16000);
  await current("B");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(
    reader.getByRole("button", { name: "Pause story rotation", exact: true }),
  ).toBeEnabled();
  await page.clock.fastForward(8000);
  await current("A");
  await page.getByRole("link", { name: "Home", exact: true }).click();
  const count = bodies.length;
  await page.clock.fastForward(60000);
  expect(bodies).toHaveLength(count);
  await expect(page.locator(".leaderboard-screen")).toHaveCount(0);
});

for (const [width, height] of [
  [1920, 1080],
  [1366, 768],
  [1024, 768],
  [768, 1024],
  [390, 844],
]) {
  test(`presentation main stage and playback controls fit ${width}x${height}`, async ({
    page,
  }) => {
    const { reader, current } = await setup(page, width, height);
    await page
      .getByRole("button", { name: "Presentation Mode", exact: true })
      .click();
    await expect(page.locator(".projector")).toBeVisible();
    if (width >= 960) {
      const left = (await page.locator(".lb-score-panel").boundingBox())!,
        right = (await reader.boundingBox())!;
      expect(right.width / (left.width + right.width)).toBeGreaterThan(0.6);
      expect(right.width / (left.width + right.width)).toBeLessThan(0.64);
      expect(Math.abs(left.height - right.height)).toBeLessThan(2);
    }
    await page.clock.fastForward(8000);
    await current("B");
    await reader
      .getByRole("button", { name: "Pause story rotation", exact: true })
      .click();
    // Axe schedules browser work; restore real browser time once the slideshow
    // is explicitly paused so accessibility checks can finish normally.
    await page.clock.resume();
    await page.screenshot({
      path: `reports/leaderboard-stage-${width}.png`,
      fullPage: true,
    });
    expect(
      await page
        .locator(".projector")
        .evaluate(
          (element) =>
            element.scrollWidth <= element.clientWidth &&
            element.scrollHeight <= element.clientHeight,
        ),
    ).toBe(true);
    await expect(
      reader.getByRole("button", {
        name: "Resume story rotation",
        exact: true,
      }),
    ).toBeInViewport();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}
