const DEFAULT_APP_VERSION = "0.0.0";

export async function fetchAppVersion() {
  try {
    const response = await fetch("/api/version", { cache: "no-store" });
    if (!response.ok) {
      return DEFAULT_APP_VERSION;
    }
    const version = (await response.text()).trim();
    return version || DEFAULT_APP_VERSION;
  } catch {
    return DEFAULT_APP_VERSION;
  }
}
