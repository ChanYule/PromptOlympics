import { useEffect, useState, useCallback } from "react";
export function useFeed<T>(url: string, interval = 60000) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [updated, setUpdated] = useState<Date | null>(null),
    [version, bump] = useState(0);
  const refresh = useCallback(() => bump((v) => v + 1), []);
  useEffect(() => {
    let cancelled = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      controller: AbortController | undefined,
      etag = "",
      previous = "",
      failures = 0,
      running = false;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (!cancelled) timer = setTimeout(load, delay);
    };
    async function load() {
      if (cancelled || running) return;
      if (document.hidden) {
        schedule(interval);
        return;
      }
      running = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15000);
      try {
        const response = await fetch(url, {
          headers: etag ? { "If-None-Match": etag } : {},
          signal: controller.signal,
        });
        if (response.status !== 304) {
          const payload = await response.json();
          if (!response.ok)
            throw new Error(
              payload.error ||
                "The latest results are temporarily unavailable.",
            );
          const serialized = JSON.stringify(payload);
          if (!cancelled && serialized !== previous) {
            setData(payload);
            previous = serialized;
          }
          etag = response.headers.get("ETag") || "";
        }
        if (!cancelled) {
          setUpdated(new Date());
          setError("");
        }
        failures = 0;
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "The connection was interrupted.",
          );
          failures++;
        }
      } finally {
        clearTimeout(timeout);
        running = false;
        schedule(
          failures
            ? Math.min(interval * 4, 5000 * 2 ** Math.min(failures - 1, 6))
            : interval,
        );
      }
    }
    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void load();
      }
    };
    document.addEventListener("visibilitychange", visible);
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [url, interval, version]);
  return { data, error, updated, refresh };
}
