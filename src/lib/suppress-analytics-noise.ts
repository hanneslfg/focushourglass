/**
 * Lovable's editor injects an internal analytics beacon at `/__l5e/trackevents`
 * that returns 403 in some published contexts (custom domains, cross-origin
 * previews, etc.). It's harmless but spams the console with red errors that
 * make real bugs harder to spot. Intercept ONLY that path and swallow the
 * error — nothing in the app code depends on the response.
 */
if (typeof window !== "undefined") {
  const w = window as typeof window & { __hg_fetch_patched?: boolean };
  if (!w.__hg_fetch_patched) {
    w.__hg_fetch_patched = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input?.url ?? "";
      if (url.includes("/__l5e/")) {
        try {
          const res = await origFetch(input, init);
          if (!res.ok) {
            // Return a synthetic OK so callers don't log the 403.
            return new Response("", { status: 204 });
          }
          return res;
        } catch {
          return new Response("", { status: 204 });
        }
      }
      return origFetch(input, init);
    };
  }
}

export {};
