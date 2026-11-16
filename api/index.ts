import type { Request, Response } from "express";
import { attachDatabasePool } from "@vercel/functions";
import { createApp } from "../server/src/app.js";
import { pool } from "../server/src/models/db.js";
import { initializeDatabase, validateEnvironment } from "../server/src/bootstrap.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

attachDatabasePool(pool);
let ready: Promise<ReturnType<typeof createApp>> | undefined;
function application() {
  if (!ready) ready = (async () => {
    const secret = validateEnvironment(process.env);
    const schema = await readFile(path.join(process.cwd(), "server/src/models/schema.sql"), "utf8");
    await initializeDatabase(pool, schema, process.env);
    const app = createApp(pool, secret, {
      key: process.env.LLM_API_KEY, url: process.env.LLM_BASE_URL, model: process.env.LLM_MODEL,
    });
    // Vercel terminates TLS and supplies the client address through its proxy.
    app.set("trust proxy", 1);
    return app;
  })().catch((error) => { ready = undefined; throw error; });
  return ready;
}
export default async function handler(req: Request, res: Response) {
  try {
    const app = await application();
    res.setHeader("Cache-Control", "no-store");
    app(req, res);
  } catch {
    // Do not include database URLs or credentials in public errors/logs.
    console.error("Application initialization failed. Check server environment and database availability.");
    res.status(503).json({ error: "Сервер пока не готов. Проверьте подключение базы и переменные окружения." });
  }
}
