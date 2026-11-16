import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import bcrypt from "bcrypt";
import { pool } from "./models/db.js";
import { createApp } from "./app.js";
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32)
  throw new Error("JWT_SECRET должен содержать не менее 32 символов");
if (!process.env.DATABASE_URL) throw new Error("Укажите DATABASE_URL");
const here = path.dirname(fileURLToPath(import.meta.url));
await pool.query(
  await readFile(path.resolve(here, "../src/models/schema.sql"), "utf8"),
);
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  if (
    process.env.ADMIN_PASSWORD.length < 12 ||
    Buffer.byteLength(process.env.ADMIN_PASSWORD) > 72
  )
    throw new Error("ADMIN_PASSWORD: от 12 символов до 72 байт");
  await pool.query(
    "INSERT INTO users(email,name,password_hash,role) VALUES($1,'Администратор',$2,'admin') ON CONFLICT(email) DO NOTHING",
    [
      process.env.ADMIN_EMAIL.toLowerCase(),
      await bcrypt.hash(process.env.ADMIN_PASSWORD, 12),
    ],
  );
}
const app = createApp(pool, secret, {
  key: process.env.LLM_API_KEY,
  url: process.env.LLM_BASE_URL,
  model: process.env.LLM_MODEL,
});
const frontend = path.resolve(here, "../../client/dist");
app.use(express.static(frontend));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.join(frontend, "index.html")),
);
const server = app.listen(Number(process.env.PORT || 3000), () =>
  console.log("Tax assistant: http://localhost:" + (process.env.PORT || 3000)),
);
process.on("SIGTERM", () => {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
});
