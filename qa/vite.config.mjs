import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { defineConfig } from "vite";
import vinext from "vinext";

// Browser QA only: no Cloudflare credentials, bindings, or production data.
process.env.SESSION_SECRET = "local-browser-qa-secret-never-use-in-production";
process.env.BOOTSTRAP_CODE = "local-browser-qa";
process.env.OPERATOR_INITIAL_SECURITY_CODE = "7319";
process.env.STUDENT_INITIAL_SECURITY_CODE = "08372";
export default defineConfig({
  plugins: [vinext()],
  resolve: { alias: { "cloudflare:workers": fileURLToPath(new URL("./sqlite-env.mjs", import.meta.url)) } },
  server: {
    host: "127.0.0.1", port: 5173, strictPort: true, watch: { ignored: ['**/outputs/**'] },
    // Release snapshots can share node_modules through a junction; allow their actual font files.
    fs: { allow: [fileURLToPath(new URL("../", import.meta.url)), realpathSync(new URL("../node_modules", import.meta.url))] },
  },
});
