import express from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { api } from "./controllers/api.js";
import type { DB } from "./models/db.js";
import type { LLMConfig } from "./services/answer.js";
export function createApp(db: DB, secret: string, llm: LLMConfig = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  app.use("/api", api(db, secret, llm));
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Маршрут не найден" }),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ZodError)
        return res
          .status(400)
          .json({ error: "Проверьте поля формы", details: err.flatten() });
      if (err.code === "23505")
        return res.status(409).json({ error: "Такая запись уже существует" });
      if (err.code === "23503")
        return res.status(400).json({ error: "Связанная запись не найдена" });
      if (err.type === "entity.too.large")
        return res.status(413).json({ error: "Слишком большой документ" });
      if (err instanceof SyntaxError)
        return res.status(400).json({ error: "Некорректный JSON" });
      res
        .status(err.status || 500)
        .json({ error: err.status ? err.message : "Ошибка сервера" });
    },
  );
  return app;
}
