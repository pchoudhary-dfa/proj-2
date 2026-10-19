/** One in-flight / resolved promise per browser session (login page + Strict Mode). */
let appVersionRequestPromise: Promise<string> | null = null;

export async function getAppVersion(): Promise<string> {
  if (!appVersionRequestPromise) {
    const raw = (async (): Promise<string> => {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load version");
      const data = (await res.json()) as { version?: unknown };
      if (typeof data.version !== "string" || !data.version.trim()) {
        throw new Error("Invalid version response");
      }
      return data.version.trim();
    })();
    appVersionRequestPromise = raw.catch((err) => {
      appVersionRequestPromise = null;
      throw err;
    });
  }
  return appVersionRequestPromise;
}

