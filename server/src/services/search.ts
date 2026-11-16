import type { DB } from "../models/db.js";
export function chunkText(text: string, size = 1200, overlap = 160) {
  const result: string[] = [];
  for (let start = 0; start < text.length; start += size - overlap) {
    result.push(text.slice(start, start + size));
    if (start + size >= text.length) break;
  }
  return result;
}
export async function search(
  db: DB,
  query: string,
  asOf: string,
  includeDemo: boolean,
) {
  const { rows } = await db.query(
    `SELECT c.id,c.content,d.id AS document_id,d.title,d.url,
 to_char(d.published_on,'YYYY-MM-DD') AS published_on,to_char(d.effective_from,'YYYY-MM-DD') AS effective_from,
 to_char(d.effective_to,'YYYY-MM-DD') AS effective_to,s.name AS source_name,d.metadata,
 ts_rank_cd(c.search_vector,websearch_to_tsquery('russian',$1)) AS rank
 FROM document_chunks c JOIN documents d ON d.id=c.document_id JOIN sources s ON s.id=d.source_id
 WHERE s.active AND c.search_vector @@ websearch_to_tsquery('russian',$1)
 AND d.published_on <= $2::date AND d.effective_from <= $2::date
 AND (d.effective_to IS NULL OR d.effective_to >= $2::date)
 AND ($3::boolean OR COALESCE((d.metadata->>'demo')::boolean,false)=false)
 ORDER BY rank DESC,d.published_on DESC,c.id LIMIT 6`,
    [query, asOf, includeDemo],
  );
  return rows;
}
