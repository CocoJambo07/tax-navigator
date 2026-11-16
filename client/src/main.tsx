import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useRef,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  MessageSquare,
  BookOpen,
  Settings,
  LogOut,
  Plus,
  ArrowUp,
  ArrowRight,
  ShieldCheck,
  FileText,
  Trash2,
  ExternalLink,
  Check,
  Menu,
  X,
} from "lucide-react";
import { api, json, type User } from "./api";
import "./style.css";
type Auth = { user: User; setUser: (u: User) => void };
const Context = createContext<Auth>(null!);
const useAuth = () => useContext(Context);
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const date = (s: string) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Ошибка");
function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener("session-expired", expire);
    if (sessionStorage.getItem("token"))
      api<User>("/me")
        .then(setUser)
        .catch(() => sessionStorage.removeItem("token"))
        .finally(() => setLoading(false));
    else setLoading(false);
    return () => window.removeEventListener("session-expired", expire);
  }, []);
  if (loading)
    return <div className="loader">Загружаем рабочее пространство…</div>;
  if (!user) return <Login done={setUser} />;
  return (
    <Context.Provider value={{ user, setUser }}>
      <Shell
        logout={async () => {
          try {
            await api("/auth/logout", { method: "POST" });
          } finally {
            sessionStorage.removeItem("token");
            setUser(null);
          }
        }}
      />
    </Context.Provider>
  );
}
function Login({ done }: { done: (u: User) => void }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api("/auth/" + (register ? "register" : "login"), {
        method: "POST",
        body: json(values),
      });
      sessionStorage.setItem("token", result.token);
      done(result.user);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">Н</span> Налоговый навигатор
        </div>
        <span className="eyebrow">ВАШ ПОМОЩНИК В ИЗМЕНЕНИЯХ</span>
        <h1>
          Сложные нормы.
          <br />
          <em>Понятные ответы.</em>
        </h1>
        <p>
          Находите изменения, разбирайтесь в деталях и проверяйте первоисточники
          в одном пространстве.
        </p>
        <div className="story-note">
          <ShieldCheck size={24} />
          <span>
            Каждый ответ начинается с источника.
            <br />
            Недостаточно данных? Мы прямо об этом скажем.
          </span>
        </div>
        <small>Учебный проект · Матвей Мухамедзянов / Данила Марченков</small>
      </section>
      <section className="login-form">
        <div>
          <span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
          <h2>{register ? "Создайте аккаунт" : "С возвращением"}</h2>
          <p className="muted">
            {register
              ? "Сохраняйте диалоги и возвращайтесь к ответам."
              : "Войдите, чтобы продолжить работу с источниками."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Имя
                <input
                  name="name"
                  minLength={2}
                  maxLength={80}
                  required
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Пароль
              <input
                name="password"
                type="password"
                minLength={register ? 10 : 1}
                required
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            {register && <small>От 10 символов, не более 72 байт.</small>}
            <ErrorNotice text={error} />
            <button className="primary" disabled={busy}>
              {busy ? "Подождите…" : register ? "Зарегистрироваться" : "Войти"}
              <ArrowRight size={18} />
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Уже есть аккаунт? Войти"
              : "Нет аккаунта? Зарегистрироваться"}
          </button>
        </div>
      </section>
    </main>
  );
}
function ErrorNotice({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="error">
      {text}
    </p>
  ) : null;
}
function Shell({ logout }: { logout: () => Promise<void> }) {
  const { user } = useAuth(),
    [chats, setChats] = useState<any[]>([]),
    [mobile, setMobile] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const refresh = () =>
    api<any[]>("/chats")
      .then(setChats)
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    void refresh();
    window.addEventListener("chats-changed", refresh);
    return () => window.removeEventListener("chats-changed", refresh);
  }, []);
  async function create() {
    try {
      const c = await api("/chats", { method: "POST" });
      await refresh();
      navigate("/chat/" + c.id);
      setMobile(false);
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <div className="app">
      <button
        className="mobile-menu"
        aria-label="Меню"
        onClick={() => setMobile(!mobile)}
      >
        {mobile ? <X /> : <Menu />}
      </button>
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="brand-mark">Н</span>
          <span>
            Налоговый
            <br />
            навигатор
          </span>
        </div>
        <button className="new-chat" onClick={create}>
          <Plus size={18} /> Новый диалог
        </button>
        <nav>
          <NavLink to="/" end onClick={() => setMobile(false)}>
            <MessageSquare size={18} />
            Помощник
          </NavLink>
          <NavLink to="/sources" onClick={() => setMobile(false)}>
            <BookOpen size={18} />
            Источники
          </NavLink>
          {user.role === "admin" && (
            <NavLink to="/admin" onClick={() => setMobile(false)}>
              <ShieldCheck size={18} />
              Управление
            </NavLink>
          )}
        </nav>
        <div className="history-label">
          ВАШИ ДИАЛОГИ <span>{chats.length}</span>
        </div>
        <div className="chat-list">
          {chats.length ? (
            chats.map((c) => (
              <NavLink
                key={c.id}
                to={"/chat/" + c.id}
                onClick={() => setMobile(false)}
              >
                <MessageSquare size={14} />
                <span>{c.title}</span>
              </NavLink>
            ))
          ) : (
            <p>Здесь появится история вопросов</p>
          )}
        </div>
        <ErrorNotice text={error} />
        <div className="sidebar-bottom">
          <NavLink
            className="profile-link"
            to="/profile"
            onClick={() => setMobile(false)}
          >
            <span className="avatar">{user.name[0]}</span>
            <div>
              <b>{user.name}</b>
              <small>
                {user.role === "admin" ? "Администратор" : "Личный кабинет"}
              </small>
            </div>
            <Settings size={16} />
          </NavLink>
          <button className="logout" onClick={() => void logout()}>
            <LogOut size={16} /> Выйти
          </button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Chat key="new" />} />
          <Route path="/chat/:id" element={<Chat />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/profile" element={<Profile />} />
          <Route
            path="/admin"
            element={user.role === "admin" ? <Admin /> : <Navigate to="/" />}
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
function Chat() {
  const { id } = useParams(),
    navigate = useNavigate(),
    [messages, setMessages] = useState<any[]>([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [asOf, setAsOf] = useState(today()),
    [detail, setDetail] = useState("short"),
    [demo, setDemo] = useState(false),
    [status, setStatus] = useState<any>(null);
  const end = useRef<HTMLDivElement>(null),
    current = useRef(id);
  current.current = id;
  useEffect(() => {
    setMessages([]);
    setError("");
    if (!id) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    api<any[]>("/chats/" + id + "/messages")
      .then((m) => {
        if (alive) setMessages(m);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    api("/status")
      .then(setStatus)
      .catch(() => {});
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError("");
    const content = question;
    let chat = id;
    try {
      if (!chat) {
        const c = await api("/chats", { method: "POST" });
        chat = String(c.id);
        window.dispatchEvent(new Event("chats-changed"));
      }
      await api("/chats/" + chat + "/messages", {
        method: "POST",
        body: json({ content, asOf, detail, includeDemo: demo }),
      });
      if (!id) {
        navigate("/chat/" + chat);
      } else if (current.current === chat) {
        setMessages(await api("/chats/" + chat + "/messages"));
        setQuestion("");
      }
      window.dispatchEvent(new Event("chats-changed"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!id || !confirm("Удалить этот диалог и все его сообщения?")) return;
    try {
      await api("/chats/" + id, { method: "DELETE" });
      window.dispatchEvent(new Event("chats-changed"));
      navigate("/");
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <div className="chat-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Рабочее пространство /</span>
          <b> ИИ-помощник</b>
        </div>
        <span className="status">
          <i />
          {status?.llm ? "LLM подключена" : "Поиск по документам"}
        </span>
      </header>
      <div className="conversation">
        {loading ? (
          <p className="muted">Загрузка диалога…</p>
        ) : messages.length === 0 ? (
          <div className="welcome">
            <span className="hero-icon">
              <BookOpen size={32} />
            </span>
            <span className="eyebrow">ОТ ВОПРОСА К ПЕРВОИСТОЧНИКУ</span>
            <h1>
              Разберёмся
              <br />в налоговых изменениях
            </h1>
            <p>
              Задайте вопрос. Помощник найдёт подходящие фрагменты
              <br className="desktop" /> и покажет, на каких документах основан
              ответ.
            </p>
            <div className="suggestions">
              {[
                "Срок подачи декларации УСН",
                "Ставка НДС по дате отгрузки",
                "Пониженная ставка НДС 10%",
                "Декларация 3-НДФЛ",
              ].map((s) => (
                <button key={s} onClick={() => setQuestion(s)}>
                  <b>{s}</b>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
            <section className="welcome-guide" aria-labelledby="welcome-guide-title">
              <h2 id="welcome-guide-title">Как пользоваться помощником</h2>
              <p>
                Укажите налог и отчётный период. Если нужно проверить, какие
                правила действовали в конкретный день, выберите дату под полем
                вопроса.
              </p>
              <p>
                В ответе откройте ссылку на публикацию, чтобы прочитать её
                целиком. Список загруженных материалов доступен в разделе{" "}
                <NavLink to="/sources">«Источники»</NavLink>.
              </p>
              <p>
                Переключатель «Учебные данные» добавляет к поиску вымышленные
                примеры для демонстрации.
              </p>
            </section>
          </div>
        ) : (
          <div className="messages">
            <div className="dialog-tools">
              <span>{messages.length} сообщений</span>
              <button className="text-button" disabled={busy} onClick={remove}>
                <Trash2 size={14} /> Удалить диалог
              </button>
            </div>
            {messages.map((m) => (
              <article key={m.id} className={"message " + m.role}>
                <div className="message-meta">
                  <span>
                    {m.role === "user" ? "Вы" : "Налоговый навигатор"}
                  </span>
                  <small>
                    {new Date(m.created_at).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
                <div className="message-content">{m.content}</div>
                {m.mode && (
                  <span className="mode-tag">
                    {
                      {
                        llm: "Ответ LLM · проверьте по первоисточнику",
                        extractive: "Выдержки из документов",
                        fallback: "Резервный режим: выдержки",
                        no_data: "Недостаточно данных",
                      }[m.mode as string]
                    }
                  </span>
                )}
                {m.citations?.length > 0 && (
                  <div className="citations">
                    <b>Основание ответа · {m.citations.length}</b>
                    {m.citations.map((c: any) => (
                      <details key={c.id}>
                        <summary>
                          <FileText size={16} />
                          <span>
                            [{c.id}] {c.title}
                          </span>
                          {c.demo && <em>Учебный пример</em>}
                        </summary>
                        <small>
                          {c.source_name} · опубликован {date(c.published_on)} ·
                          действует с {date(c.effective_from)}
                          {c.effective_to ? " до " + date(c.effective_to) : ""}
                        </small>
                        <p>{c.excerpt}</p>
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noreferrer">
                            Первоисточник <ExternalLink size={13} />
                          </a>
                        )}
                      </details>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {busy && (
          <div className="thinking">Ищем фрагменты и готовим ответ…</div>
        )}
        <div ref={end} />
      </div>
      <div className="composer-wrap">
        <ErrorNotice text={error} />
        <form onSubmit={submit} className="composer">
          <textarea
            aria-label="Ваш вопрос"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Что вы хотите узнать об изменениях?"
            minLength={2}
            maxLength={4000}
            required
            disabled={busy}
          />
          <div className="composer-controls">
            <label>
              На дату
              <input
                aria-label="Дата актуальности"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                required
              />
            </label>
            <select
              aria-label="Подробность ответа"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            >
              <option value="short">Краткий ответ</option>
              <option value="detailed">Подробный ответ</option>
            </select>
            <label className="check">
              <input
                type="checkbox"
                checked={demo}
                onChange={(e) => setDemo(e.target.checked)}
              />
              Учебные данные
            </label>
            <button
              className="send"
              disabled={busy || loading || question.trim().length < 2}
              aria-label="Отправить вопрос"
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </form>
        <p className="composer-note">
          Проверяйте выводы по первоисточнику. Помощник не заменяет
          профессиональную консультацию.
        </p>
      </div>
    </div>
  );
}
function Sources() {
  const [sources, setSources] = useState<any[]>([]),
    [docs, setDocs] = useState<any[]>([]),
    [demo, setDemo] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<any[]>("/sources"), api<any[]>("/documents?demo=" + demo)])
      .then(([s, d]) => {
        setSources(s);
        setDocs(d);
      })
      .catch((e) => setError(errorText(e)));
  }, [demo]);
  return (
    <section className="page">
      <span className="eyebrow">ДОКУМЕНТАЛЬНАЯ ОСНОВА</span>
      <h1>Источники и документы</h1>
      <p className="muted">
        База пополняется администратором. Дата загрузки не подтверждает
        актуальность нормы.
      </p>
      <ErrorNotice text={error} />
      <div className="source-grid">
        {sources.map((s) => (
          <article className="card" key={s.id}>
            <BookOpen />
            <h3>{s.name}</h3>
            <p>
              {s.document_count} документов ·{" "}
              {s.active ? "В поиске" : "Отключён"}
            </p>
            <small>Обновлён {date(s.updated_at)}</small>
            {s.url && (
              <a href={s.url} target="_blank" rel="noreferrer">
                Открыть источник ↗
              </a>
            )}
          </article>
        ))}
      </div>
      <div className="section-title">
        <h2>Загруженные документы</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={demo}
            onChange={(e) => setDemo(e.target.checked)}
          />
          Показать учебные
        </label>
      </div>
      {!docs.length && (
        <div className="empty">
          Пока нет документов. Администратор может добавить проверенные тексты в
          разделе «Управление».
        </div>
      )}
      {docs.map((d) => (
        <article className="document" key={d.id}>
          <FileText />
          <div>
            <b>{d.title}</b>
            <p>
              {d.source_name} · действует с {date(d.effective_from)}
            </p>
            {d.metadata?.demo && (
              <span className="demo-label">Вымышленный учебный пример</span>
            )}
          </div>
          {d.url && (
            <a
              href={d.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Первоисточник"
            >
              <ExternalLink size={18} />
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
function Profile() {
  const { user, setUser } = useAuth(),
    [name, setName] = useState(user.name),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <section className="page narrow">
      <span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span>
      <h1>Ваш профиль</h1>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setSaved(false);
          try {
            setUser(
              await api<User>("/me", { method: "PATCH", body: json({ name }) }),
            );
            setSaved(true);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Имя
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
        </label>
        <label>
          Email
          <input value={user.email} disabled />
        </label>
        <p className="muted">
          Роль: {user.role === "admin" ? "администратор" : "пользователь"}
        </p>
        <ErrorNotice text={error} />
        {saved && (
          <p className="success">
            <Check size={16} /> Изменения сохранены
          </p>
        )}
        <button className="primary" disabled={busy}>
          Сохранить
        </button>
      </form>
    </section>
  );
}
function Admin() {
  const [tab, setTab] = useState("sources"),
    [stats, setStats] = useState<any>({}),
    [sources, setSources] = useState<any[]>([]),
    [users, setUsers] = useState<any[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [docs, setDocs] = useState<any[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [sourceId, setSourceId] = useState(""),
    [file, setFile] = useState<File | null>(null);
  async function load() {
    const [a, b, c, d, e] = await Promise.all([
      api("/admin/stats"),
      api("/sources"),
      api("/admin/users"),
      api("/admin/history"),
      api("/documents?demo=true"),
    ]);
    setStats(a);
    setSources(b);
    setUsers(c);
    setHistory(d);
    setDocs(e);
    setSourceId((old) => old || String(b[0]?.id || ""));
  }
  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, []);
  async function action(fn: () => Promise<unknown>, message = "Сохранено") {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
      await load();
      setNotice(message);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page">
      <span className="eyebrow">АДМИНИСТРАТИВНАЯ ПАНЕЛЬ</span>
      <h1>Управление системой</h1>
      <div className="stats">
        {[
          ["users", "Пользователи"],
          ["documents", "Документы"],
          ["requests", "Запросы"],
          ["avg_ms", "Среднее время, мс"],
        ].map(([key, title]) => (
          <div key={key}>
            <strong>{stats[key] ?? "—"}</strong>
            <span>{title}</span>
          </div>
        ))}
      </div>
      <div className="tabs">
        {[
          ["sources", "Источники"],
          ["users", "Пользователи"],
          ["history", "История запросов"],
        ].map(([k, t]) => (
          <button
            key={k}
            className={tab === k ? "selected" : ""}
            onClick={() => setTab(k)}
          >
            {t}
          </button>
        ))}
      </div>
      <ErrorNotice text={error} />
      {notice && <p className="success">{notice}</p>}
      {tab === "sources" && (
        <>
          <div className="admin-columns">
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const b = Object.fromEntries(new FormData(form));
                void action(async () => {
                  await api("/admin/sources", {
                    method: "POST",
                    body: json({ ...b, url: b.url || null }),
                  });
                  form.reset();
                });
              }}
            >
              <h2>Добавить источник</h2>
              <label>
                Название
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={160}
                  placeholder="Например, ФНС России"
                />
              </label>
              <label>
                Ссылка HTTPS
                <input name="url" type="url" placeholder="https://…" />
              </label>
              <button className="primary" disabled={busy}>
                Добавить
              </button>
            </form>
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  if (!file) throw new Error("Выберите JSON-файл");
                  if (file.size > 900000)
                    throw new Error("Файл слишком большой");
                  const b = JSON.parse(await file.text());
                  await api("/admin/documents", {
                    method: "POST",
                    body: json({ ...b, source_id: Number(sourceId) }),
                  });
                }, "Документ загружен и проиндексирован");
              }}
            >
              <h2>Загрузить документ</h2>
              <label>
                Источник
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  required
                >
                  <option value="">Выберите источник</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                JSON-файл
                <input
                  type="file"
                  accept=".json,application/json"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <small>
                Поля: title, content, published_on, effective_from,
                effective_to, url, demo. Пример находится в
                data/demo-document.json.
              </small>
              <button className="primary" disabled={busy || !sourceId}>
                Загрузить и индексировать
              </button>
            </form>
          </div>
          <h2>Источники</h2>
          {sources.map((s) => (
            <div className="admin-row" key={s.id}>
              <div>
                <b>{s.name}</b>
                <small>{s.document_count} документов</small>
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  void action(() =>
                    api("/admin/sources/" + s.id, {
                      method: "PATCH",
                      body: json({ active: !s.active }),
                    }),
                  )
                }
              >
                {s.active ? "Отключить" : "Включить"}
              </button>
            </div>
          ))}
          <h2>Документы активных источников</h2>
          {docs.map((d) => (
            <div className="admin-row" key={d.id}>
              <span>{d.title}</span>
              <button
                aria-label={"Удалить " + d.title}
                disabled={busy}
                onClick={() => {
                  if (confirm("Удалить документ из поисковой базы?"))
                    void action(() =>
                      api("/admin/documents/" + d.id, { method: "DELETE" }),
                    );
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </>
      )}
      {tab === "users" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Роль</th>
                <th>Доступ</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    <small>{u.email}</small>
                  </td>
                  <td>{u.role}</td>
                  <td>{u.active ? "Активен" : "Заблокирован"}</td>
                  <td>
                    {u.role !== "admin" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(() =>
                            api("/admin/users/" + u.id, {
                              method: "PATCH",
                              body: json({ active: !u.active }),
                            }),
                          )
                        }
                      >
                        {u.active ? "Заблокировать" : "Разблокировать"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "history" && (
        <>
          <p className="muted">
            Последние 100 запросов. Доступ к истории имеют только
            администраторы.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Время / пользователь</th>
                  <th>Запрос</th>
                  <th>Дата поиска</th>
                  <th>Фрагменты</th>
                  <th>мс</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>
                      {new Date(h.created_at).toLocaleString("ru-RU")}
                      <small>{h.email}</small>
                    </td>
                    <td>{h.query}</td>
                    <td>{date(h.as_of)}</td>
                    <td>{h.result_count}</td>
                    <td>{h.duration_ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
