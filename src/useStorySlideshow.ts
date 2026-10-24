import { useEffect, useRef, useState } from "react";
import { readSaved, save } from "./api";
import type { Entry } from "./types";

export const STORY_INTERVALS = [8, 12, 20, 30, 45, 60];

export function useStorySlideshow(
  entries: Entry[],
  selectedId: string | null,
  onSelect: (id: string) => void,
) {
  const [seconds, setSeconds] = useState(() => {
    const saved = readSaved<number>("slideshow-seconds", 8);
    return STORY_INTERVALS.includes(saved) ? saved : 8;
  });
  const [paused, setPaused] = useState(
    () => readSaved<boolean>("slideshow-paused", false) === true,
  );
  const [suspended, setSuspended] = useState(false);
  const [cycle, resetCycle] = useState(0);
  const latest = useRef({ entries, selectedId, onSelect });
  latest.current = { entries, selectedId, onSelect };

  useEffect(() => {
    save("slideshow-seconds", seconds);
  }, [seconds]);
  useEffect(() => {
    save("slideshow-paused", paused);
  }, [paused]);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const app = document.querySelector(".app");
    const update = () =>
      setSuspended(
        document.hidden ||
          motion.matches ||
          !!app?.classList.contains("reduced"),
      );
    update();
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    const observer = new MutationObserver(update);
    if (app)
      observer.observe(app, { attributes: true, attributeFilter: ["class"] });
    return () => {
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  // One timeout per story. Polling may refresh scores/order without restarting
  // the slide, while every manual selection receives a complete new interval.
  useEffect(() => {
    if (paused || suspended || entries.length < 2 || !selectedId) return;
    const timer = setTimeout(() => {
      const current = latest.current;
      if (
        document.hidden ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.querySelector(".app.reduced") ||
        current.entries.length < 2
      )
        return;
      const index = current.entries.findIndex(
        (entry) => entry.submissionId === current.selectedId,
      );
      current.onSelect(
        current.entries[(Math.max(0, index) + 1) % current.entries.length]
          .submissionId,
      );
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [seconds, paused, suspended, selectedId, entries.length, cycle]);

  function select(id: string) {
    resetCycle((value) => value + 1);
    onSelect(id);
  }
  function move(step: number) {
    if (!entries.length) return;
    const index = entries.findIndex(
      (entry) => entry.submissionId === selectedId,
    );
    select(
      entries[(Math.max(0, index) + step + entries.length) % entries.length]
        .submissionId,
    );
  }
  return {
    seconds,
    paused,
    suspended,
    cycle,
    select,
    move,
    reset: () => resetCycle((value) => value + 1),
    toggle: () => setPaused((value) => !value),
    setSeconds: (value: number) => {
      if (STORY_INTERVALS.includes(value)) setSeconds(value);
    },
  };
}
