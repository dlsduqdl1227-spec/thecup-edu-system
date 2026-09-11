import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vinext from "vinext";

// Browser QA only: no Cloudflare credentials, bindings, or production data.
process.env.SESSION_SECRET = "local-browser-qa-secret-never-use-in-production";
process.env.BOOTSTRAP_CODE = "local-browser-qa";
export default defineConfig({
  plugins: [vinext()],
  resolve: { alias: { "cloudflare:workers": fileURLToPath(new URL("./sqlite-env.mjs", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
