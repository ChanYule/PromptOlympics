import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("creation protects entered ideas and event screens fit phones, tablets and large displays", async ({
  page,
}) => {
  const round = {
    id: "design",
    roundNumber: 1,
    state: "SUBMISSIONS_OPEN",
    minVotes: 5,
    allowSelfVotes: true,
  };
  await page.route("**/api/competition", (r) => r.fulfill({ json: round }));
  await page.route("**/api/leaderboard", (r) =>
    r.fulfill({
      json: {
        round,
        final: false,
        entries: [
          {
            submissionId: "waiting",
            participantName: "Captain Wizard",
            title: "A Very Long Story Title for the Community Competition",
            aiScore: 4.25,
            averageScore: null,
            finalScore: null,
            voteCount: 0,
            eligible: false,
            judgingStatus: "ready",
          },
        ],
      },
    }),
  );
  await page.route("**/api/leaderboard/story/*", (r) =>
    r.fulfill({
      json: {
        story:
          "A robot orders kopi. The uncle asks whether it wants the usual. The robot requests a software update instead.",
      },
    }),
  );
  await page.goto("/play");
  await expect(
    page.getByRole("button", { name: "Create My Funny Story", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("What should we call").fill("Captain Wizard");
  await page.getByLabel("What should happen").fill("Keep my original idea");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "A robot orders kopi", exact: true })
    .click();
  await expect(page.getByLabel("What should happen")).toHaveValue(
    "Keep my original idea",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "A robot orders kopi", exact: true })
    .click();
  await expect(page.getByLabel("What should happen")).toHaveValue(
    "A robot orders kopi",
  );
  await expect(
    page.getByRole("button", { name: "Create My Funny Story", exact: true }),
  ).toBeEnabled();
  for (const path of ["/play", "/leaderboard"]) {
    await page.goto(path);
    if (path === "/leaderboard") {
      await expect(
        page.getByRole("heading", {
          name: "Provisional standings",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator(".podium-card")).toHaveCount(0);
      await expect(page.locator(".total-score")).toHaveText("Total Score—");
      await page.getByText("How rankings work", { exact: true }).click();
      await expect(
        page.getByText(
          "At least 5 public votes are needed to qualify for the final awards.",
          { exact: true },
        ),
      ).toHaveCount(2);
    }
    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({
        width,
        height: width === 1024 ? 768 : 1000,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page
      .getByRole("button", { name: "Aa Larger text", exact: true })
      .click();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Aa Larger text", exact: true })
      .click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: `reports/redesign-${path.slice(1)}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `reports/redesign-${path.slice(1)}-mobile.png`,
      fullPage: true,
    });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Unavailable"));
  });
  await page
    .getByRole("button", { name: "Presentation Mode", exact: true })
    .click();
  await expect(page.locator(".projector")).toBeVisible();
  await page
    .getByRole("button", { name: "Exit Presentation", exact: true })
    .click();
  await expect(page.locator(".projector")).toHaveCount(0);
});
