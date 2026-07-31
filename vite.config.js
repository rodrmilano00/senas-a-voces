import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAINING_DIR = path.resolve(__dirname, "public", "training_data");
const MANIFEST = path.join(TRAINING_DIR, "manifest.json");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

// Guarda los ejemplos entrenados en public/training_data/<categoria>/<SEÑA>_<n>.json
// numerando de forma acumulativa, y agrega la seña al manifest.json.
function trainSignPlugin() {
  return {
    name: "train-sign-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/training-data", (req, res) => {
        const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
        const requested = pathname.replace(/^\/+/, "");
        const relative = requested === "manifest" ? "manifest.json" : requested;
        const filePath = path.resolve(TRAINING_DIR, relative);
        if (!relative || !filePath.startsWith(`${TRAINING_DIR}${path.sep}`) || !filePath.endsWith(".json")) {
          sendJson(res, 400, { ok: false, error: "Ruta de entrenamiento inválida" });
          return;
        }
        try {
          sendJson(res, 200, JSON.parse(fs.readFileSync(filePath, "utf8")));
        } catch (e) {
          sendJson(res, e.code === "ENOENT" ? 404 : 500, { ok: false, error: e.message });
        }
      });

      server.middlewares.use("/api/train-sign", async (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { ok: false, error: "Method Not Allowed" }); return; }
        try {
          const { signName, category = "palabras", examples } = JSON.parse(await readBody(req));
          if (!signName || !Array.isArray(examples) || examples.length === 0) {
            sendJson(res, 400, { ok: false, error: "signName y examples son requeridos" });
            return;
          }
          const sign = String(signName).trim().toUpperCase();
          const catDir = path.join(TRAINING_DIR, category);
          fs.mkdirSync(catDir, { recursive: true });

          // Continuar numeracion desde ejemplos existentes (acumula)
          let startN = 0;
          for (const f of fs.readdirSync(catDir)) {
            const m = f.match(new RegExp("^" + sign.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "_(\\d+)\\.json$"));
            if (m) startN = Math.max(startN, parseInt(m[1], 10));
          }

          const files = [];
          examples.forEach((frames, i) => {
            const n = startN + i + 1;
            const outFile = path.join(catDir, `${sign}_${n}.json`);
            const stamped = frames.map((fr) => ({ ...fr, sign }));
            fs.writeFileSync(outFile, JSON.stringify(stamped, null, 2), "utf8");
            files.push(`${category}/${sign}_${n}.json`);
          });

          // Actualizar manifest.json
          let manifest = {};
          try { manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch { manifest = {}; }
          if (!Array.isArray(manifest[category])) manifest[category] = [];
          if (!manifest[category].includes(sign)) manifest[category].push(sign);
          fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");

          console.log(`[TRAIN] ${sign} (${category}): +${files.length} ejemplo(s)`, files);
          sendJson(res, 200, { ok: true, sign, category, saved: files.length, files });
        } catch (e) {
          console.error("[TRAIN] error:", e);
          sendJson(res, 500, { ok: false, error: e.message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), trainSignPlugin()]
});
