export type User = { id: number; email: string; name: string; role: string };
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem("token");
  const r = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...options.headers,
    },
  });
  if (r.status === 401 && token) {
    sessionStorage.removeItem("token");
    window.dispatchEvent(new Event("session-expired"));
  }
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || "Не удалось выполнить запрос");
  }
  return r.status === 204 ? (undefined as T) : await r.json();
}
export const json = (data: unknown) => JSON.stringify(data);
