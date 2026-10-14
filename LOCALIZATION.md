# English and Chinese interface

Every page has an **English / 中文** switch. Chinese uses Simplified Chinese, with natural wording suited to Singapore users. The selected language is remembered in the browser and updates page titles, navigation, form labels, help, ratings, state messages, errors, organiser controls/confirmations, and score explanations. Switching does not reload the page, clear drafts, change a selected rating, restart a job, or alter recorded votes/scores.

New generation requests capture the selected language: English stories keep the 100-word target; Chinese stories use a 400-character limit and a 12-character title limit. The server rejects unsupported language values. Changing the interface language while a request is active does not change or duplicate that request. Existing pending requests without a language field remain compatible. Previously submitted stories, ideas, participant nicknames and organiser-entered round titles remain as submitted; switching the interface does not rewrite competition entries.

Chinese CSV exports include translated headers/eligibility labels and a UTF-8 BOM for Excel. Backups retain the original database fields/content. Read-aloud requests select an English or Chinese speech locale from the story text; actual voice availability depends on the device.

## Translation review and maintenance

`src/locales/zh.ts` holds the Chinese interface and error catalog. `src/i18n.ts` handles language persistence, document language, interpolation and known server error messages. Status values and API identifiers remain internal protocol values; translate them only when displaying them.

Consistent terms:

| English                | Chinese      |
| ---------------------- | ------------ |
| Participant            | 参赛者       |
| Public score           | 公众评分     |
| Combined / total score | 总分         |
| AI judging             | AI 评审      |
| Provisional            | 暂定成绩     |
| Award eligible         | 具备获奖资格 |
| Round                  | 轮           |
| Organisers             | 主办方       |
| Voting code            | 投票码       |
| Leaderboard            | 排行榜       |

Run `npm.cmd run test:i18n`, `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run test:e2e` after wording changes. The audit checks static interface/accessibility text, shared arrays, SQL/server error coverage, interpolation placeholders, malformed Unicode, and accidental translation of protocol comparisons. Tests also check switching, persisted language, draft/rating preservation, Chinese errors and CSV, Chinese generation/length validation, responsive layouts, fullscreen and accessibility.

Human-readable interface wording has been reviewed in context. Provider-generated stories are original AI content, not fixed interface translations, so the static translation audit does not certify every future generated story.
