CREATE TABLE IF NOT EXISTS users (
 id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 active BOOLEAN NOT NULL DEFAULT true, token_version INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chats (
 id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL DEFAULT 'Новый диалог', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
 id SERIAL PRIMARY KEY, chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
 citations JSONB NOT NULL DEFAULT '[]', mode TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sources (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, url TEXT, active BOOLEAN NOT NULL DEFAULT true,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents (
 id SERIAL PRIMARY KEY, source_id INTEGER NOT NULL REFERENCES sources(id), title TEXT NOT NULL, url TEXT,
 published_on DATE NOT NULL, effective_from DATE NOT NULL, effective_to DATE,
 content TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(effective_to IS NULL OR effective_to >= effective_from)
);
CREATE TABLE IF NOT EXISTS document_chunks (
 id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, content TEXT NOT NULL,
 search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('russian', content)) STORED,
 UNIQUE(document_id, ordinal)
);
CREATE INDEX IF NOT EXISTS chunks_search_idx ON document_chunks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS messages_chat_idx ON messages(chat_id,id);
CREATE INDEX IF NOT EXISTS chats_user_idx ON chats(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS search_history (
 id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
 query TEXT NOT NULL, as_of DATE NOT NULL, result_count INTEGER NOT NULL, duration_ms INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
