import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import request from "supertest";
import { createApp } from "../src/app.js";
import { answer } from "../src/services/answer.js";
import { chunkText, search } from "../src/services/search.js";
import type { DB } from "../src/models/db.js";
const pg = new PGlite();
const query = async (text: string, values?: any[]) =>
  pg.query(text, values) as any;
const db: DB = { query, connect: async () => ({ query, release() {} }) };
const app = createApp(db, "test-secret-with-more-than-thirty-two-characters");
let admin: string,
  user: string,
  other: string,
  uid: number,
  chat: number,
  source: number,
  document: number;
const auth = (token: string) => ({ Authorization: "Bearer " + token });
before(async () => {
  await pg.exec(
    await readFile(
      new URL("../src/models/schema.sql", import.meta.url),
      "utf8",
    ),
  );
});
after(async () => {
  await pg.close();
});
test("регистрация, хеширование, запрет повышения роли", async () => {
  const a = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Администратор",
      email: "admin@test.local",
      password: "SecurePass1234",
      role: "admin",
    })
    .expect(201);
  assert.equal(a.body.user.role, "user");
  await query("UPDATE users SET role='admin' WHERE id=$1", [a.body.user.id]);
  admin = a.body.token;
  const b = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Студент",
      email: "user@test.local",
      password: "SecurePass1234",
    })
    .expect(201);
  user = b.body.token;
  uid = b.body.user.id;
  other = (
    await request(app)
      .post("/api/auth/register")
      .send({
        name: "Другой",
        email: "other@test.local",
        password: "SecurePass1234",
      })
      .expect(201)
  ).body.token;
  const stored = (
    await query("SELECT password_hash FROM users WHERE id=$1", [uid])
  ).rows[0].password_hash;
  assert.match(stored, /^\$2/);
  assert.notEqual(stored, "SecurePass1234");
  await request(app)
    .post("/api/auth/register")
    .send({
      name: "Дубль",
      email: "USER@test.local",
      password: "SecurePass1234",
    })
    .expect(409);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "user@test.local", password: "wrong" })
    .expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "USER@test.local", password: "SecurePass1234" })
    .expect(200);
});
test("валидация, защищённые маршруты и профиль", async () => {
  await request(app).get("/api/me").expect(401);
  await request(app).get("/api/admin/users").set(auth(user)).expect(403);
  await request(app)
    .post("/api/auth/register")
    .send({ email: "bad", name: "X", password: "short" })
    .expect(400);
  const r = await request(app)
    .patch("/api/me")
    .set(auth(user))
    .send({ name: "Новое имя" })
    .expect(200);
  assert.equal(r.body.name, "Новое имя");
});
test("импорт источника и атомарная индексация", async () => {
  source = (
    await request(app)
      .post("/api/admin/sources")
      .set(auth(admin))
      .send({ name: "Учебные примеры" })
      .expect(201)
  ).body.id;
  const sample = JSON.parse(
    await readFile(
      new URL("../../data/demo-document.json", import.meta.url),
      "utf8",
    ),
  );
  document = (
    await request(app)
      .post("/api/admin/documents")
      .set(auth(admin))
      .send({ ...sample, source_id: source })
      .expect(201)
  ).body.id;
  assert.equal(
    (
      await query(
        "SELECT count(*)::int AS n FROM document_chunks WHERE document_id=$1",
        [document],
      )
    ).rows[0].n,
    1,
  );
  await request(app)
    .post("/api/admin/documents")
    .set(auth(admin))
    .send({ ...sample, source_id: source, effective_from: "2026-02-30" })
    .expect(400);
  await request(app)
    .post("/api/admin/documents")
    .set(auth(admin))
    .send({ ...sample, source_id: source, effective_to: "2025-01-01" })
    .expect(400);
  await request(app)
    .post("/api/admin/documents")
    .set(auth(admin))
    .send({ ...sample, source_id: source, demo: false })
    .expect(400);
  await request(app)
    .post("/api/admin/documents")
    .set(auth(admin))
    .send({ ...sample, source_id: 9999 })
    .expect(400);
  assert.equal(
    (await query("SELECT count(*)::int AS n FROM documents")).rows[0].n,
    1,
  );
});
test("полнотекстовый поиск: русская морфология, дата, учебные данные, активность", async () => {
  assert.equal((await search(db, "декларация", "2026-11-12", true)).length, 1);
  assert.equal((await search(db, "декларация", "2026-01-15", true)).length, 0);
  assert.equal((await search(db, "декларация", "2026-11-12", false)).length, 0);
  await request(app)
    .patch("/api/admin/sources/" + source)
    .set(auth(admin))
    .send({ active: false })
    .expect(200);
  assert.equal((await search(db, "декларация", "2026-11-12", true)).length, 0);
  await request(app)
    .patch("/api/admin/sources/" + source)
    .set(auth(admin))
    .send({ active: true })
    .expect(200);
  await query("UPDATE documents SET effective_to='2026-09-01' WHERE id=$1", [
    document,
  ]);
  assert.equal((await search(db, "декларация", "2026-11-12", true)).length, 0);
  await query("UPDATE documents SET effective_to=NULL WHERE id=$1", [document]);
});
test("чат: сохранение пары сообщений, цитаты и изоляция пользователей", async () => {
  chat = (await request(app).post("/api/chats").set(auth(user)).expect(201))
    .body.id;
  const r = await request(app)
    .post(`/api/chats/${chat}/messages`)
    .set(auth(user))
    .send({
      content: "Срок подачи декларации",
      asOf: "2026-11-12",
      includeDemo: true,
    })
    .expect(201);
  assert.equal(r.body.mode, "extractive");
  assert.equal(r.body.citations.length, 1);
  assert.equal(r.body.citations[0].demo, true);
  assert.equal(
    (
      await request(app)
        .get(`/api/chats/${chat}/messages`)
        .set(auth(user))
        .expect(200)
    ).body.length,
    2,
  );
  await request(app)
    .get(`/api/chats/${chat}/messages`)
    .set(auth(other))
    .expect(404);
  await request(app).delete(`/api/chats/${chat}`).set(auth(other)).expect(404);
  await request(app)
    .post(`/api/chats/${chat}/messages`)
    .set(auth(other))
    .send({ content: "текст", asOf: "2026-11-12" })
    .expect(404);
});
test("отсутствие данных и контекстное уточнение", async () => {
  const payload = { asOf: "2026-11-12", includeDemo: true };
  const follow = await request(app)
    .post(`/api/chats/${chat}/messages`)
    .set(auth(user))
    .send({ ...payload, content: "Подробнее" })
    .expect(201);
  assert.equal(follow.body.mode, "extractive");
  const r = await request(app)
    .post(`/api/chats/${chat}/messages`)
    .set(auth(user))
    .send({ ...payload, content: "Космические ракеты" })
    .expect(201);
  assert.equal(r.body.mode, "no_data");
  assert.equal(r.body.citations.length, 0);
  const h = await request(app)
    .get("/api/admin/history")
    .set(auth(admin))
    .expect(200);
  assert.equal(h.body.length, 3);
  const stats = await request(app)
    .get("/api/admin/stats")
    .set(auth(admin))
    .expect(200);
  assert.equal(stats.body.requests, 3);
});
test("блокировка отзываёт токен, разблокировка не восстанавливает сессию", async () => {
  await request(app)
    .patch(`/api/admin/users/${uid}`)
    .set(auth(admin))
    .send({ active: false })
    .expect(200);
  await request(app).get("/api/me").set(auth(user)).expect(401);
  await request(app)
    .patch(`/api/admin/users/${uid}`)
    .set(auth(admin))
    .send({ active: true })
    .expect(200);
  await request(app).get("/api/me").set(auth(user)).expect(401);
  user = (
    await request(app)
      .post("/api/auth/login")
      .send({ email: "user@test.local", password: "SecurePass1234" })
      .expect(200)
  ).body.token;
});
test("удаление диалога каскадно и выход отзывают доступ", async () => {
  await request(app).delete(`/api/chats/${chat}`).set(auth(user)).expect(204);
  assert.equal(
    (
      await query("SELECT count(*)::int AS n FROM messages WHERE chat_id=$1", [
        chat,
      ])
    ).rows[0].n,
    0,
  );
  await request(app).post("/api/auth/logout").set(auth(user)).expect(204);
  await request(app).get("/api/me").set(auth(user)).expect(401);
});
test("фрагменты перекрываются без потери текста", () => {
  const input = "x".repeat(2800);
  const chunks = chunkText(input);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 1200);
  assert.equal(chunks.join("").length, 3120);
});
test("LLM: валидный ответ, неизвестная цитата, ошибка сервиса", async () => {
  const hits = [
    {
      id: 7,
      title: "Учебный документ",
      content: "Вымышленный факт",
      metadata: { demo: true },
    },
  ];
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Учебный пример [7]",
                  citation_ids: [7],
                }),
              },
            },
          ],
        }),
      );
    assert.equal(
      (
        await answer("Вопрос", hits, [], "short", {
          key: "fake",
          model: "mock",
        })
      ).mode,
      "llm",
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Утверждение [999]",
                  citation_ids: [999],
                }),
              },
            },
          ],
        }),
      );
    assert.equal(
      (await answer("Вопрос", hits, [], "short", { key: "fake" })).mode,
      "fallback",
    );
    globalThis.fetch = async () => new Response("", { status: 503 });
    assert.equal(
      (await answer("Вопрос", hits, [], "short", { key: "fake" })).mode,
      "fallback",
    );
  } finally {
    globalThis.fetch = original;
  }
});
