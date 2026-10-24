import { test, expect } from "@playwright/test";

for (const format of ["normalized", "local"]) {
  test(`removed stories disappear from admin cards, jobs and counts after reload (${format})`, async ({
    page,
  }) => {
    const round = {
      id: "removal-round",
      title: "Round",
      roundNumber: 1,
      state: "SUBMISSIONS_OPEN",
      minVotes: 5,
    };
    const stories = [
      {
        id: "visible",
        title: "Visible Story",
        participantName: "Visible Author",
        prompt: "An idea",
        resultText: "A story",
        roundId: round.id,
        deleted: false,
      },
      {
        id: "removed",
        title: "Previously Removed Story",
        participantName: "Removed Author",
        prompt: "An old idea",
        resultText: "An old story",
        roundId: round.id,
        deleted: true,
      },
    ];
    const jobs = [
      {
        id: "visible-job",
        submissionId: "visible",
        status: "failed",
        input: { participantName: "Visible failed request" },
      },
      {
        id: "removed-job",
        submissionId: "removed",
        status: "failed",
        input: { participantName: "Removed failed request" },
      },
      { id: "removed-pending-job", submissionId: "removed", status: "judging" },
      {
        id: "unsaved",
        status: "failed",
        input: { participantName: "Unrelated unsaved request" },
      },
    ];
    const votes = [{ submissionId: "visible" }, { submissionId: "removed" }];
    await page.route("**/api/admin/competition", (route) =>
      route.fulfill({
        json: {
          round,
          metrics: {},
          transitions: [],
          data:
            format === "local"
              ? { rounds: [{ ...round, submissions: stories, votes }], jobs }
              : {
                  rounds: [round],
                  submissions: stories.map((s) => ({
                    ...s,
                    round_id: s.roundId,
                    participant_id: s.id,
                    story: s.resultText,
                  })),
                  participants: stories.map((s) => ({
                    id: s.id,
                    name: s.participantName,
                  })),
                  judgements: stories.map((s) => ({
                    submission_id: s.id,
                    status: "failed",
                  })),
                  jobs: jobs.map(({ submissionId, ...job }) => ({
                    ...job,
                    submission_id: submissionId,
                  })),
                  votes: votes.map((v) => ({ submission_id: v.submissionId })),
                },
        },
      }),
    );
    await page.route("**/api/admin/delete", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        submissionId: "visible",
        confirm: true,
      });
      stories[0].deleted = true;
      await route.fulfill({ json: {} });
    });
    await page.goto("/admin");
    await page
      .getByLabel("Organiser password")
      .fill("browser-test-password-16");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const review = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Review submissions",
        exact: true,
      }),
    });
    const stat = (label: string) =>
      page
        .locator(".stats .card")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("strong");
    await expect(review.locator("article")).toHaveCount(1);
    await expect(
      page.getByText("Previously Removed Story", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/Removed failed request/)).toHaveCount(0);
    await expect(stat("Stories")).toHaveText("1");
    await expect(stat("Votes")).toHaveText("1");
    await expect(stat("AI jobs pending")).toHaveText("0");
    await expect(stat("Failed requests")).toHaveText("2");
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("organiser dashboard");
      await dialog.accept();
    });
    await page
      .getByRole("button", { name: "Remove story", exact: true })
      .click();
    await expect(review.locator("article")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Organiser Dashboard" }),
    ).toBeVisible();
    await expect(review.locator("article")).toHaveCount(0);
    await expect(page.getByText(/Visible failed request/)).toHaveCount(0);
    await expect(page.getByText(/Unrelated unsaved request/)).toBeVisible();
    await expect(stat("Stories")).toHaveText("0");
    await expect(stat("Votes")).toHaveText("0");
    await expect(stat("Failed requests")).toHaveText("1");
  });
}
