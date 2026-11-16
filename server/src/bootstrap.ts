import bcrypt from "bcrypt";
import type { DB } from "./models/db.js";
import { transaction } from "./models/db.js";
type Environment = Record<string, string | undefined>;
export function validateEnvironment(env: Environment) {
  if (!env.DATABASE_URL) throw new Error("Укажите DATABASE_URL");
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET должен содержать не менее 32 символов");
  if (!!env.ADMIN_EMAIL !== !!env.ADMIN_PASSWORD)
    throw new Error("ADMIN_EMAIL и ADMIN_PASSWORD задаются вместе");
  if (env.ADMIN_PASSWORD && (env.ADMIN_PASSWORD.length < 12 || Buffer.byteLength(env.ADMIN_PASSWORD) > 72))
    throw new Error("ADMIN_PASSWORD: от 12 символов до 72 байт");
  return env.JWT_SECRET;
}
export async function initializeDatabase(db: DB, schema: string, env: Environment) {
  // Transaction-scoped lock serializes schema creation across cold instances.
  await transaction(db, async (connection) => {
    await connection.query("SELECT pg_advisory_xact_lock(728194602)");
    await connection.query(schema);
    if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
      const email = env.ADMIN_EMAIL.trim().toLowerCase();
      const { rows } = await connection.query("SELECT role FROM users WHERE email=$1", [email]);
      if (rows.length && rows[0].role !== "admin")
        throw new Error("ADMIN_EMAIL уже занят обычным пользователем");
      if (!rows.length) await connection.query(
        "INSERT INTO users(email,name,password_hash,role) VALUES($1,'Администратор',$2,'admin') ON CONFLICT(email) DO NOTHING",
        [email, await bcrypt.hash(env.ADMIN_PASSWORD, 12)],
      );
    }
  });
}
