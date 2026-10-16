import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("loading view shows live stages, survives reload, switches language and reveals saved story", async ({
  page,
}) => {
  let status = "queued";
  let submissions = 0;
  await page.route("**/api/competition", (r) =>
    r.fulfill({
      json: {
        id: "r",
        state: "SUBMISSIONS_OPEN",
        roundNumber: 1,
        title: "Test",
      },
    }),
  );
  const job = () => ({
    id: "loading-job",
    status,
    submission:
      status === "ready"
        ? {
            id: "s",
            participantName: "Alice",
            title: "Robot Soup",
            resultText: "A robot made soup.",
          }
        : null,
  });
  await page.route("**/api/generate-story", (r) => {
    submissions++;
    return r.fulfill({ json: job() });
  });
  await page.route("**/api/jobs/loading-job", (r) =>
    r.fulfill({ json: job() }),
  );
  await page.goto("/play");
  await page.getByLabel("What should we call").fill("Alice");
  await page.getByLabel("What should happen").fill("A robot makes soup");
  await page.getByRole("button", { name: "Create My Funny Story" }).click();
  await expect(
    page.getByRole("heading", { name: "Your story is on its way" }),
  ).toBeFocused();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Your request is in the queue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Creating your story" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your story is on its way" }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  status = "generating";
  await expect(page.getByText("Turning your idea into a story…")).toBeVisible();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "你的故事正在创作中" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  status = "saving";
  await expect(
    page.getByText("Your story is written. Saving it to the competition…"),
  ).toBeVisible();
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
  await page.screenshot({
    path: "reports/story-loading-mobile.png",
    fullPage: true,
  });
  status = "ready";
  await expect(page.getByRole("heading", { name: "Robot Soup" })).toBeVisible();
  await expect(
    page.getByText("Saved to the competition", { exact: true }),
  ).toBeVisible();
  expect(submissions).toBe(1);
});
