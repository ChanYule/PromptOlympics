import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("mobile gameplay keeps ideas optional, focuses the saved story and records only a confirmed rating", async ({
  page,
}) => {
  await page.request.post("/__test/fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/booth"]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Aa Larger text" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `reports/gameplay-${path === "/" ? "home" : "welcome"}-mobile.png`,
      fullPage: true,
    });
  }
  await page.goto("/play");
  await expect(
    page.getByRole("button", { name: "A robot orders kopi", exact: true }),
  ).toBeHidden();
  await page.locator(".inspiration summary").focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "A robot orders kopi", exact: true }),
  ).toBeVisible();
  await page.getByLabel("What should we call").fill("Happy Panda");
  await page
    .getByRole("button", { name: "A robot orders kopi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create My Funny Story", exact: true })
    .click();
  await expect(page.locator(".story-heading h2")).toBeFocused();
  await expect(page.getByText("AI score:")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Read aloud", exact: true }),
  ).toHaveCount(
    await page.evaluate(() => ("speechSynthesis" in window ? 1 : 0)),
  );
  let votes = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/votes") && request.method() === "POST")
      votes++;
  });
  await page.getByLabel("3 stars: Enjoyable").check();
  await page.getByLabel("3 stars: Enjoyable").press("ArrowRight");
  await expect(page.getByLabel("4 stars: Funny")).toBeChecked();
  expect(votes).toBe(0);
  await page
    .getByRole("button", { name: "Submit My Vote", exact: true })
    .click();
  await expect(
    page.getByText("Thank you for voting!", { exact: true }),
  ).toBeVisible();
  expect(votes).toBe(1);
  await page.screenshot({
    path: "reports/gameplay-story-mobile.png",
    fullPage: true,
  });
  await page.goto("/vote");
  await expect(page.locator(".discovery-card")).toHaveCount(1);
  await page.screenshot({
    path: "reports/gameplay-gallery-mobile.png",
    fullPage: true,
  });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "reports/gameplay-gallery-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Read and Vote", exact: false })
    .first()
    .click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page
    .getByRole("button", { name: "Aa Larger text", exact: true })
    .click();
  await page
    .getByRole("button", { name: "High contrast", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.request.post("/__test/fresh");
});
