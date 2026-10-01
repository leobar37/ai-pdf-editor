import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
// Load only the fal credential into the server process, never into VITE_*.
const serverEnv = loadEnv("development", process.cwd(), "FAL_");
if (!process.env.FAL_KEY && serverEnv.FAL_KEY)
  process.env.FAL_KEY = serverEnv.FAL_KEY;
export default defineConfig({
  plugins: [tanstackStart(), react()],
  server: { host: "0.0.0.0", port: 3025, strictPort: true },
});
