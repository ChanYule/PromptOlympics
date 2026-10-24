// Final collision guard; creative titles still come from the finished story.
export function uniqueStoryTitle(title, titles) {
  const key = (value) => value.trim().replace(/\s+/gu, " ").toLowerCase();
  const used = new Set(titles.map(key));
  let candidate = title;
  for (let index = 2; used.has(key(candidate)); index++) {
    const suffix = ` (${index})`;
    const chinese = /\p{Script=Han}/u.test(title);
    const base = chinese
      ? title
      : title.trim().split(/\s+/u).slice(0, 5).join(" ");
    candidate =
      Array.from(base)
        .slice(0, (chinese ? 12 : 100) - suffix.length)
        .join("")
        .trimEnd() + suffix;
  }
  return candidate;
}
