import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import type { DB } from "../models/db.js";
import { transaction } from "../models/db.js";
import { auth, admin, sign } from "../middleware/auth.js";
import { search, chunkText } from "../services/search.js";
import { answer, type LLMConfig } from "../services/answer.js";
const email = z
  .string()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const password = z
  .string()
  .min(10)
  .refine((s) => Buffer.byteLength(s) <= 72, "Пароль не более 72 байт");
const id = (s: unknown) => z.coerce.number().int().positive().parse(s);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === s;
  }, "Некорректная дата");
const url = z
  .string()
  .url()
  .max(2000)
  .refine((s) => s.startsWith("https://"), "Нужна HTTPS-ссылка")
  .nullable()
  .optional();
const publicUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
export function api(db: DB, secret: string, llm: LLMConfig = {}) {
  const r = Router();
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Слишком много попыток. Попробуйте позже." },
  });
  r.post("/auth/register", loginLimit, async (req, res) => {
    const b = z
      .object({ email, password, name: z.string().trim().min(2).max(80) })
      .parse(req.body);
    const hash = await bcrypt.hash(b.password, 12);
    const { rows } = await db.query(
      "INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING *",
      [b.email, b.name, hash],
    );
    res
      .status(201)
      .json({ token: sign(rows[0], secret), user: publicUser(rows[0]) });
  });
  r.post("/auth/login", loginLimit, async (req, res) => {
    const b = z
      .object({ email, password: z.string().max(100) })
      .parse(req.body);
    const { rows } = await db.query("SELECT * FROM users WHERE email=$1", [
      b.email,
    ]);
    const u = rows[0];
    if (!u || !u.active || !(await bcrypt.compare(b.password, u.password_hash)))
      return res.status(401).json({ error: "Неверный email или пароль" });
    res.json({ token: sign(u, secret), user: publicUser(u) });
  });
  r.use(auth(db, secret));
  r.get("/me", (req, res) => res.json(publicUser(req.user)));
  r.patch("/me", async (req, res) => {
    const b = z
      .object({ name: z.string().trim().min(2).max(80) })
      .parse(req.body);
    await db.query("UPDATE users SET name=$1 WHERE id=$2", [
      b.name,
      req.user!.id,
    ]);
    res.json({ ...publicUser(req.user), name: b.name });
  });
  r.post("/auth/logout", async (req, res) => {
    await db.query(
      "UPDATE users SET token_version=token_version+1 WHERE id=$1",
      [req.user!.id],
    );
    res.sendStatus(204);
  });
  r.get("/status", (_req, res) =>
    res.json({ llm: !!llm.key, model: llm.key ? llm.model : null }),
  );
  r.get("/chats", async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT * FROM chats WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 200",
          [req.user!.id],
        )
      ).rows,
    ),
  );
  r.post("/chats", async (req, res) =>
    res
      .status(201)
      .json(
        (
          await db.query("INSERT INTO chats(user_id) VALUES($1) RETURNING *", [
            req.user!.id,
          ])
        ).rows[0],
      ),
  );
  const owned = async (chat: number, user: number) => {
    const { rows } = await db.query(
      "SELECT id FROM chats WHERE id=$1 AND user_id=$2",
      [chat, user],
    );
    if (!rows.length)
      throw Object.assign(new Error("Диалог не найден"), { status: 404 });
  };
  r.get("/chats/:id/messages", async (req, res) => {
    const chat = id(req.params.id);
    await owned(chat, req.user!.id);
    res.json(
      (
        await db.query("SELECT * FROM messages WHERE chat_id=$1 ORDER BY id", [
          chat,
        ])
      ).rows,
    );
  });
  r.delete("/chats/:id", async (req, res) => {
    const chat = id(req.params.id);
    await owned(chat, req.user!.id);
    await db.query("DELETE FROM chats WHERE id=$1", [chat]);
    res.sendStatus(204);
  });
  const busy = new Set<number>();
  r.post(
    "/chats/:id/messages",
    rateLimit({
      windowMs: 60000,
      limit: 12,
      message: { error: "Подождите минуту перед следующим запросом" },
    }),
    async (req, res) => {
      const start = Date.now(),
        chat = id(req.params.id);
      await owned(chat, req.user!.id);
      const b = z
        .object({
          content: z.string().trim().min(2).max(4000),
          asOf: date,
          detail: z.enum(["short", "detailed"]).default("short"),
          includeDemo: z.boolean().default(false),
        })
        .parse(req.body);
      if (busy.has(chat))
        return res
          .status(409)
          .json({ error: "Дождитесь ответа в этом диалоге" });
      busy.add(chat);
      try {
        const history = (
          await db.query(
            "SELECT role,content FROM messages WHERE chat_id=$1 ORDER BY id DESC LIMIT 6",
            [chat],
          )
        ).rows.reverse();
        let hits = await search(db, b.content, b.asOf, b.includeDemo);
        // Для короткого уточнения повторно ищем по последнему предметному вопросу.
        if (
          !hits.length &&
          history.length &&
          /^(а |подробнее|уточни|кого |какие условия|когда |поясни|расскажи подробнее)/i.test(
            b.content,
          )
        ) {
          const prev = [...history].reverse().find((m) => m.role === "user");
          if (prev)
            hits = await search(db, prev.content, b.asOf, b.includeDemo);
        }
        const result = await answer(b.content, hits, history, b.detail, llm);
        const rows = await transaction(db, async (c) => {
          await c.query(
            "INSERT INTO messages(chat_id,role,content) VALUES($1,'user',$2)",
            [chat, b.content],
          );
          const { rows } = await c.query(
            "INSERT INTO messages(chat_id,role,content,citations,mode) VALUES($1,'assistant',$2,$3,$4) RETURNING *",
            [
              chat,
              result.content,
              JSON.stringify(result.citations),
              result.mode,
            ],
          );
          await c.query(
            "UPDATE chats SET title=CASE WHEN title='Новый диалог' THEN $1 ELSE title END,updated_at=now() WHERE id=$2",
            [b.content.slice(0, 70), chat],
          );
          await c.query(
            "INSERT INTO search_history(user_id,chat_id,query,as_of,result_count,duration_ms) VALUES($1,$2,$3,$4,$5,$6)",
            [
              req.user!.id,
              chat,
              b.content,
              b.asOf,
              hits.length,
              Date.now() - start,
            ],
          );
          return rows;
        });
        res.status(201).json(rows[0]);
      } finally {
        busy.delete(chat);
      }
    },
  );
  r.get("/sources", async (_req, res) =>
    res.json(
      (
        await db.query(
          "SELECT s.*,count(d.id)::int AS document_count FROM sources s LEFT JOIN documents d ON d.source_id=s.id GROUP BY s.id ORDER BY s.id",
        )
      ).rows,
    ),
  );
  r.get("/documents", async (req, res) => {
    const demo = req.query.demo === "true";
    res.json(
      (
        await db.query(
          `SELECT d.id,d.title,d.url,d.published_on,d.effective_from,d.effective_to,d.metadata,s.name AS source_name FROM documents d JOIN sources s ON s.id=d.source_id WHERE s.active AND ($1::boolean OR COALESCE((metadata->>'demo')::boolean,false)=false) ORDER BY d.published_on DESC LIMIT 200`,
          [demo],
        )
      ).rows,
    );
  });
  r.use("/admin", admin);
  r.get("/admin/users", async (_req, res) =>
    res.json(
      (
        await db.query(
          "SELECT id,email,name,role,active,created_at FROM users ORDER BY id LIMIT 500",
        )
      ).rows,
    ),
  );
  r.patch("/admin/users/:id", async (req, res) => {
    const user = id(req.params.id);
    const b = z.object({ active: z.boolean() }).parse(req.body);
    if (user === req.user!.id)
      return res
        .status(400)
        .json({ error: "Нельзя блокировать собственный аккаунт" });
    const { rows } = await db.query(
      "UPDATE users SET active=$1,token_version=token_version+1 WHERE id=$2 AND role<>'admin' RETURNING id",
      [b.active, user],
    );
    if (!rows.length)
      return res
        .status(404)
        .json({ error: "Пользователь не найден или защищён" });
    res.json({ ok: true });
  });
  r.get("/admin/stats", async (_req, res) =>
    res.json(
      (
        await db.query(
          `SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM chats) AS chats,(SELECT count(*)::int FROM documents) AS documents,(SELECT count(*)::int FROM search_history) AS requests,(SELECT round(avg(duration_ms)) FROM search_history) AS avg_ms`,
        )
      ).rows[0],
    ),
  );
  r.get("/admin/history", async (_req, res) =>
    res.json(
      (
        await db.query(
          "SELECT h.*,u.email FROM search_history h JOIN users u ON u.id=h.user_id ORDER BY h.id DESC LIMIT 100",
        )
      ).rows,
    ),
  );
  r.post("/admin/sources", async (req, res) => {
    const b = z
      .object({ name: z.string().trim().min(2).max(160), url })
      .parse(req.body);
    res
      .status(201)
      .json(
        (
          await db.query(
            "INSERT INTO sources(name,url) VALUES($1,$2) RETURNING *",
            [b.name, b.url || null],
          )
        ).rows[0],
      );
  });
  r.patch("/admin/sources/:id", async (req, res) => {
    const b = z.object({ active: z.boolean() }).parse(req.body);
    const { rows } = await db.query(
      "UPDATE sources SET active=$1,updated_at=now() WHERE id=$2 RETURNING *",
      [b.active, id(req.params.id)],
    );
    if (!rows[0]) return res.status(404).json({ error: "Источник не найден" });
    res.json(rows[0]);
  });
  r.post("/admin/documents", async (req, res) => {
    const b = z
      .object({
        source_id: z.number().int().positive(),
        title: z.string().min(3).max(300),
        url,
        published_on: date,
        effective_from: date,
        effective_to: date.nullable().optional(),
        content: z.string().min(30).max(200000),
        demo: z.boolean().default(false),
      })
      .parse(req.body);
    if (b.effective_to && b.effective_to < b.effective_from)
      return res
        .status(400)
        .json({ error: "Дата окончания раньше даты начала" });
    if (!b.demo && !b.url)
      return res
        .status(400)
        .json({
          error: "Для реального документа обязательна ссылка на первоисточник",
        });
    const doc = await transaction(db, async (c) => {
      const { rows } = await c.query(
        "INSERT INTO documents(source_id,title,url,published_on,effective_from,effective_to,content,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [
          b.source_id,
          b.title,
          b.url || null,
          b.published_on,
          b.effective_from,
          b.effective_to || null,
          b.content,
          JSON.stringify({ demo: b.demo, imported_by: req.user!.id }),
        ],
      );
      const chunks = chunkText(b.title + "\n" + b.content);
      for (let i = 0; i < chunks.length; i++)
        await c.query(
          "INSERT INTO document_chunks(document_id,ordinal,content) VALUES($1,$2,$3)",
          [rows[0].id, i, chunks[i]],
        );
      await c.query("UPDATE sources SET updated_at=now() WHERE id=$1", [
        b.source_id,
      ]);
      return { ...rows[0], chunks: chunks.length };
    });
    res.status(201).json(doc);
  });
  r.delete("/admin/documents/:id", async (req, res) => {
    await db.query("DELETE FROM documents WHERE id=$1", [id(req.params.id)]);
    res.sendStatus(204);
  });
  return r;
}
