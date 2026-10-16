import { useEffect, useRef, useState } from "react";
import { finishParticipant, readSaved, save } from "./api";
import { t, message } from "./i18n";
export function Booth({
  children,
}: {
  children: (finished: () => void) => React.ReactNode;
}) {
  const [started, setStarted] = useState(() =>
    readSaved("booth-started", false),
  );
  const [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [warning, setWarning] = useState(false),
    [idle, setIdle] = useState(() => readSaved("booth-idle-reset", false));
  const lastActivity = useRef(Date.now());
  function finished() {
    setStarted(false);
    setVersion((v) => v + 1);
    setWarning(false);
    window.scrollTo(0, 0);
  }
  async function resetIdle() {
    try {
      await finishParticipant();
      finished();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!idle || !started) return;
    const activity = () => {
      lastActivity.current = Date.now();
      setWarning(false);
    };
    const timer = setInterval(() => {
      const generation = readSaved<{ jobId?: string } | null>(
        "generation",
        null,
      );
      const job = readSaved<{ submission?: unknown } | null>("last-job", null);
      if (
        readSaved("pending-vote", null) ||
        readSaved("participant-reset", null) ||
        (generation && !job?.submission)
      ) {
        lastActivity.current = Date.now();
        return;
      }
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed >= 150000) {
        lastActivity.current = Date.now();
        void resetIdle();
      } else setWarning(elapsed >= 120000);
    }, 1000);
    for (const event of ["pointerdown", "keydown", "input"])
      window.addEventListener(event, activity);
    return () => {
      clearInterval(timer);
      for (const event of ["pointerdown", "keydown", "input"])
        window.removeEventListener(event, activity);
    };
  }, [idle, started]);
  return (
    <div key={version}>
      {!started ? (
        <section className="content narrow card booth-welcome">
          <p className="eyebrow">{t("Welcome to Prompt Olympics")}</p>
          <h1>{t("One idea. Your own funny story.")}</h1>
          <p>
            {t(
              "Create a story, read it, and give it a star rating. No registration needed.",
            )}
          </p>
          <button
            className="primary full"
            onClick={() => {
              save("booth-started", true);
              setStarted(true);
              lastActivity.current = Date.now();
            }}
          >
            {t("Start Creating My Story")}
          </button>
          <a className="button" href="/play">
            {t("Using your own phone? Open personal mode")}
          </a>
          <details>
            <summary>{t("Booth settings")}</summary>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={idle}
                onChange={(e) => {
                  setIdle(e.target.checked);
                  save("booth-idle-reset", e.target.checked);
                }}
              />
              {t("Reset an inactive booth after a warning")}
            </label>
            <p>
              {t(
                "After two minutes without activity, a 30-second warning appears. Story creation and unconfirmed votes are never cleared automatically.",
              )}
            </p>
          </details>
        </section>
      ) : (
        children(finished)
      )}
      {warning && (
        <aside className="notice" role="alert">
          <p>{t("This booth will reset in 30 seconds unless you continue.")}</p>
          <button
            onClick={() => {
              lastActivity.current = Date.now();
              setWarning(false);
            }}
          >
            {t("I am still here")}
          </button>
        </aside>
      )}
      {error && (
        <p className="notice error" role="alert">
          {message(error)}
        </p>
      )}
    </div>
  );
}
