import pg from "pg";
export interface Queryable {
  query(
    text: string,
    values?: any[],
  ): Promise<{ rows: any[]; rowCount?: number | null }>;
}
export interface DB extends Queryable {
  connect(): Promise<Queryable & { release(): void }>;
}
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
});
export async function transaction<T>(
  db: DB,
  fn: (c: Queryable) => Promise<T>,
): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
