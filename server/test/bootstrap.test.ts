import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcrypt";
import { initializeDatabase, validateEnvironment } from "../src/bootstrap.js";
import type { DB } from "../src/models/db.js";

test("Vercel: configuration rejects missing database, short secret and incomplete admin", () => {
  assert.throws(() => validateEnvironment({}), /DATABASE_URL/);
  assert.throws(() => validateEnvironment({ DATABASE_URL: "test", JWT_SECRET: "short" }), /JWT_SECRET/);
  assert.throws(() => validateEnvironment({ DATABASE_URL: "test", JWT_SECRET: "x".repeat(32), ADMIN_EMAIL: "a@b.test" }), /вместе/);
});

test("Vercel: initialization creates admin once and preserves data on cold restart", async () => {
  const pg = new PGlite();
  const query = async (sql: string, values?: any[]) => {
    if (sql.startsWith("CREATE TABLE")) { await pg.exec(sql); return { rows: [] }; }
    return pg.query(sql, values) as any;
  };
  const db: DB = { query, connect: async () => ({ query, release() {} }) };
  const schema = await readFile(new URL("../src/models/schema.sql", import.meta.url), "utf8");
  const env = { ADMIN_EMAIL: "Admin@example.test", ADMIN_PASSWORD: "SubmissionSecure1234" };
  try {
    await initializeDatabase(db, schema, env);
    const initial: any = (await pg.query("SELECT * FROM users")).rows[0];
    assert.equal(initial.role, "admin");
    assert.equal(initial.email, "admin@example.test");
    assert.ok(await bcrypt.compare(env.ADMIN_PASSWORD, initial.password_hash));
    await pg.query("INSERT INTO chats(user_id,title) VALUES($1,'Saved conversation')", [initial.id]);
    await initializeDatabase(db, schema, { ...env, ADMIN_PASSWORD: "ChangedSecret1234" });
    const users: any[] = (await pg.query("SELECT * FROM users")).rows;
    assert.equal(users.length, 1);
    assert.equal(users[0].password_hash, initial.password_hash);
    assert.equal((await pg.query("SELECT * FROM chats")).rows.length, 1);
    await pg.query("UPDATE users SET role='user'");
    await assert.rejects(initializeDatabase(db, schema, env), /занят/);
    assert.equal((await pg.query("SELECT role FROM users")).rows[0].role, "user");
  } finally { await pg.close(); }
});
