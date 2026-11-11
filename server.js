require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DB_DIR = path.join(ROOT, "database");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD || !process.env.DEVICE_TOKEN) {
  console.error("Configure SESSION_SECRET, ADMIN_PASSWORD e DEVICE_TOKEN no arquivo .env.");
  process.exit(1);
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

const db = new Database(path.join(DB_DIR, "foxsecure.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    riddles_json TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DB_DIR }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 4
  }
}));

// Modo apresentação: sem limite de requisições
const authLimiter = (req, res, next) => next();
const attemptLimiter = (req, res, next) => next();

const riddleBank = [
  { q: "Quantos lados tem um triângulo?", a: "3", level: "Fácil" },
  { q: "Quantas rodas tem uma bicicleta comum?", a: "2", level: "Fácil" },
  { q: "Quantos meses formam um trimestre?", a: "3", level: "Fácil" },
  { q: "Quantos lados tem um quadrado?", a: "4", level: "Fácil" },
  { q: "Quantas patas tem uma aranha?", a: "8", level: "Intermediário" },
  { q: "Quantos minutos há em meia hora?", a: "30", level: "Intermediário" },
  { q: "Quantos lados tem um hexágono?", a: "6", level: "Intermediário" },
  { q: "Quantos dias há em uma semana?", a: "7", level: "Fácil" },
  { q: "Quantas letras tem a palavra FOX?", a: "3", level: "Fácil" },
  { q: "Quantos continentes são tradicionalmente ensinados no Brasil?", a: "6", level: "Intermediário" },
  { q: "Quantos vértices tem um cubo?", a: "8", level: "Intermediário" },
  { q: "Quantos lados tem um pentágono?", a: "5", level: "Intermediário" }
];

function chooseRiddles() {
  const shuffled = [...riddleBank].sort(() => Math.random() - 0.5);
  // As respostas precisam ser um único dígito para formar o código de quatro dígitos.
  const valid = shuffled.filter(item => item.a.length === 1);
  return valid.slice(0, 4);
}
function makeCode(riddles) { return riddles.map(item => item.a).join(""); }
function getActiveChallenge() {
  return db.prepare("SELECT * FROM challenges WHERE active = 1 ORDER BY id DESC LIMIT 1").get();
}
async function createChallengeAndSync() {
  const riddles = chooseRiddles();
  const code = makeCode(riddles);
  const codeHash = await bcrypt.hash(code, 12);
  const payload = { riddles: riddles.map(({ q, level }) => ({ question: q, level })), code };
  await sendDeviceCommand("/api/configure", payload);
  db.prepare("UPDATE challenges SET active = 0").run();
  db.prepare("INSERT INTO challenges (riddles_json, code_hash, active) VALUES (?, ?, 1)")
    .run(JSON.stringify(payload.riddles), codeHash);
  return payload.riddles;
}
async function sendDeviceCommand(endpoint, payload = {}) {
  if ((process.env.DEVICE_MODE || "SIMULATOR").toUpperCase() === "SIMULATOR") {
    console.log(`[SIMULADOR] Comando ${endpoint} recebido:`, endpoint.includes("configure") ? "novo desafio configurado" : "abertura solicitada");
    return { simulated: true };
  }
  const base = (process.env.ESP32_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("ESP32_BASE_URL não configurado.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(base + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Token": process.env.DEVICE_TOKEN },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`ESP32 respondeu com status ${response.status}.`);
    return await response.json().catch(() => ({ ok: true }));
  } finally {
    clearTimeout(timer);
  }
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Faça login para continuar." });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito à administração." });
  }
  next();
}
function publicUser(user) {
  return { id: user.id, nome: user.nome, username: user.username, email: user.email, role: user.role, locked: Boolean(user.locked) };
}

async function initialize() {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!admin) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    db.prepare("INSERT INTO users (nome, username, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
      .run("Administrador FoxSecure", process.env.ADMIN_USERNAME || "admin",
           process.env.ADMIN_EMAIL || "admin@foxsecure.local", hash);
  }
  if (!getActiveChallenge()) await createChallengeAndSync();
}

app.use(express.static(path.join(ROOT, "public")));

app.post("/api/register", authLimiter, async (req, res) => {
  const { nome, username, email, password, confirmPassword } = req.body || {};
  if (![nome, username, email, password, confirmPassword].every(v => typeof v === "string" && v.trim())) {
    return res.status(400).json({ error: "Preencha todos os campos." });
  }
  if (nome.trim().length < 3 || nome.trim().length > 80) return res.status(400).json({ error: "Informe um nome entre 3 e 80 caracteres." });
  if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(username.trim())) return res.status(400).json({ error: "O usuário deve ter de 3 a 20 caracteres e usar apenas letras, números, ponto, traço ou underline." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: "Informe um e-mail válido." });
  if (password.length < 4) return res.status(400).json({ error: "A senha deve ter pelo menos 4 caracteres." });
  if (password !== confirmPassword) return res.status(400).json({ error: "As senhas não coincidem." });
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = db.prepare("INSERT INTO users (nome, username, email, password_hash) VALUES (?, ?, ?, ?)")
      .run(nome.trim(), username.trim(), email.trim().toLowerCase(), passwordHash);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    req.session.user = publicUser(user);
    res.status(201).json({ ok: true, user: publicUser(user) });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({ error: "Esse nome de usuário ou e-mail já está cadastrado." });
    res.status(500).json({ error: "Não foi possível criar a conta." });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  const { login, password } = req.body || {};
  if (typeof login !== "string" || typeof password !== "string") return res.status(400).json({ error: "Informe usuário/e-mail e senha." });
  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE").get(login.trim(), login.trim());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Usuário ou senha incorretos." });
  if (user.locked) return res.status(403).json({ error: "Esta conta está bloqueada. Procure o administrador." });
  req.session.user = publicUser(user);
  res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/logout", requireLogin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get("/api/me", requireLogin, (req, res) => res.json({ user: req.session.user }));

app.get("/api/challenge", requireLogin, (req, res) => {
  const user = db.prepare("SELECT locked FROM users WHERE id = ?").get(req.session.user.id);
  if (user.locked) return res.status(403).json({ error: "Esta conta está bloqueada. Procure o administrador." });
  const challenge = getActiveChallenge();
  if (!challenge) return res.status(503).json({ error: "Desafio indisponível." });
  res.json({
    riddles: JSON.parse(challenge.riddles_json),
    attemptsLeft: Math.max(0, 3 - db.prepare("SELECT failed_attempts FROM users WHERE id = ?").get(req.session.user.id).failed_attempts)
  });
});

app.post("/api/attempt", requireLogin, attemptLimiter, async (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== "string" || !/^\d{4}$/.test(code)) return res.status(400).json({ error: "Digite os quatro números encontrados nas charadas." });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.user.id);
  if (user.locked) return res.status(403).json({ error: "Sua conta está bloqueada. Procure o administrador." });
  const challenge = getActiveChallenge();
  if (!challenge) return res.status(503).json({ error: "Desafio indisponível." });
  if (await bcrypt.compare(code, challenge.code_hash)) {
    try {
      await sendDeviceCommand("/api/unlock", { reason: "correct-code", userId: user.id });
      db.prepare("UPDATE users SET failed_attempts = 0 WHERE id = ?").run(user.id);
      return res.json({ ok: true, message: "Código correto! O comando de abertura foi enviado ao cofre." });
    } catch (error) {
      console.error(error);
      return res.status(503).json({ error: "O código está correto, mas não foi possível comunicar com o ESP32. Tente novamente ou avise o administrador." });
    }
  }
  const failed = user.failed_attempts + 1;
  const locked = failed >= 3 ? 1 : 0;
  db.prepare("UPDATE users SET failed_attempts = ?, locked = ? WHERE id = ?").run(failed, locked, user.id);
  res.status(400).json({
    error: locked ? "As três tentativas foram utilizadas. Sua conta foi bloqueada e precisa ser liberada pelo administrador." : "Código incorreto. Confira as charadas e tente novamente.",
    attemptsLeft: Math.max(0, 3 - failed),
    locked: Boolean(locked)
  });
});

app.get("/api/admin/users", requireLogin, requireAdmin, (req, res) => {
  const users = db.prepare("SELECT id, nome, username, email, failed_attempts, locked, created_at FROM users WHERE role = 'user' ORDER BY created_at DESC").all();
  res.json({ users });
});
app.post("/api/admin/new-user", requireLogin, requireAdmin, async (req, res) => {
  try {
    const riddles = await createChallengeAndSync();
    res.json({ ok: true, message: "Novo conjunto de charadas configurado.", riddles });
  } catch (error) {
    console.error(error);
    res.status(503).json({ error: "Não foi possível atualizar o desafio no ESP32. O desafio anterior foi mantido." });
  }
});
app.post("/api/admin/emergency-open", requireLogin, requireAdmin, async (req, res) => {
  try {
    await sendDeviceCommand("/api/unlock", { reason: "admin-emergency", adminId: req.session.user.id });
    res.json({ ok: true, message: "Comando de abertura de emergência enviado." });
  } catch (error) {
    console.error(error);
    res.status(503).json({ error: "Não foi possível comunicar com o ESP32." });
  }
});
app.post("/api/admin/users/:id/unlock", requireLogin, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Usuário inválido." });
  const result = db.prepare("UPDATE users SET locked = 0, failed_attempts = 0 WHERE id = ? AND role = 'user'").run(id);
  if (!result.changes) return res.status(404).json({ error: "Usuário não encontrado." });
  res.json({ ok: true, message: "Conta liberada e tentativas reiniciadas." });
});

app.get("/api/health", (req, res) => res.json({ ok: true, mode: process.env.DEVICE_MODE || "SIMULATOR" }));

initialize().then(() => {
  app.listen(PORT, () => console.log(`FoxSecure disponível em http://localhost:${PORT}`));
}).catch(error => {
  console.error("Erro ao iniciar o FoxSecure:", error);
  process.exit(1);
});
