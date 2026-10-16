import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("English/Chinese switching covers every page, preserves drafts and ratings, and persists across reloads", async ({
  page,
}) => {
  const round = {
    id: "bilingual-round",
    roundNumber: 2,
    title: "Prompt Olympics",
    state: "SUBMISSIONS_OPEN",
    minVotes: 5,
  };
  const story = {
    id: "bilingual-story",
    participantName: "测试参赛者",
    title: "清淡到关灯",
    prompt: "机器人开面摊",
    resultText: "机器人误把“清淡”理解为调暗灯光。",
    own: false,
    voted: false,
  };
  await page.route("**/api/competition", (r) => r.fulfill({ json: round }));
  await page.route("**/api/stories?*", (r) =>
    r.fulfill({ json: { items: [story], hasMore: false } }),
  );
  await page.route("**/api/leaderboard", (r) =>
    r.fulfill({
      json: {
        round,
        final: false,
        entries: [
          {
            submissionId: story.id,
            participantName: story.participantName,
            title: story.title,
            aiScore: 4.375,
            averageScore: 4.2,
            finalScore: 4.2875,
            voteCount: 5,
            eligible: true,
            judgingStatus: "ready",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "把你的点子变成 有趣的故事。",
  );
  await page
    .getByRole("link", { name: "创作故事", exact: true })
    .first()
    .click();
  await page.getByLabel("我们该怎么称呼你？").fill("保留的昵称");
  await page.getByLabel("你希望故事里发生什么事？").fill("保留的点子");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByLabel("What should we call")).toHaveValue(
    "保留的昵称",
  );
  await expect(page.getByLabel("What should happen")).toHaveValue("保留的点子");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("你希望故事里发生什么事？")).toHaveValue(
    "保留的点子",
  );
  await expect(page.getByText("故事创作语言：中文")).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  round.state = "VOTING";
  await page.goto("/vote");
  await page
    .getByRole("button", { name: "阅读与投票", exact: false })
    .first()
    .click();

  await page.getByLabel("5 星：非常喜欢").check();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByLabel("5 stars: Loved it")).toBeChecked();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.route("**/api/votes", (r) =>
    r.fulfill({ status: 409, json: { error: "Voting is closed." } }),
  );
  await page.getByRole("button", { name: "提交我的评分", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("投票已关闭。");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Voting is closed.");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.goto("/leaderboard");
  await expect(
    page.getByRole("heading", { name: "Prompt Olympics 排行榜" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "公众评分" }),
  ).toBeVisible();
  await expect(page.getByText("AI 4.38 · 公众 4.20 · 5 票")).toBeVisible();
  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `test-results/chinese-leaderboard-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Aa 放大字体" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "大屏展示模式" }).click();
  await expect(page.locator(".projector")).toBeVisible();
  await page.getByRole("button", { name: "退出大屏展示" }).click();
  await page.goto("/admin");
  await page.route("**/api/admin/competition", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (response.ok()) {
      data.round.state = "WAITING";
      data.transitions = ["SUBMISSIONS_OPEN"];
    }
    await route.fulfill({ response, json: data });
  });
  await page.getByLabel("主办方密码").fill("wrong");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("主办方密码不正确。");
  await page.getByLabel("主办方密码").fill("browser-test-password-16");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "主办方管理面板" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "开始比赛 / 开放投稿" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "检查数据库连接状态" }).click();
  await expect(page.getByText("数据库已连接 · 故事 AI 已配置")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "导出成绩（CSV）" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let csv = "";
  if (stream) for await (const chunk of stream) csv += chunk.toString();
  expect(csv).toContain("公众评分 / 5");
  expect(csv).toContain("获奖资格");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organiser Dashboard" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
});
