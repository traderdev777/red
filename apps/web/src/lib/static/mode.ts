/** True only in the GitHub Pages build (scripts/build-pages.mjs). */
export const IS_STATIC = process.env.NEXT_PUBLIC_RED_STATIC === "1";
/** Where the full app (auth, /app) is deployed, if anywhere. No trailing slash. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
