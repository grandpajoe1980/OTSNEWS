import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import sanitizeHtml from 'sanitize-html';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { getDb, saveDb } from './db';
import { encryptSecretForStorage, getEmailConfig, testConnection, sendTestEmail } from './email';
import { createSamlClient, buildDefaultSamlConfig, extractIdentity, generateSpMetadataXml, hydrateSamlConfigFromMetadata, normalizePemCertificate } from './saml';
import type { EmailConfig, SamlConfig } from '../types';

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const TRUSTED_ORIGINS = new Set([...(ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS)]);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin || TRUSTED_ORIGINS.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
}));

app.use((req, res, next) => {
  if (req.path === '/api/auth/saml/callback') {
    return next();
  }

  const isStateChanging = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
  if (!isStateChanging) {
    return next();
  }

  const origin = req.get('origin');
  if (origin && !TRUSTED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Untrusted request origin' });
  }

  const csrfSafePaths = new Set(['/api/login', '/api/users', '/api/auth/saml/callback']);
  if (!csrfSafePaths.has(req.path)) {
    const csrfHeader = req.get('x-csrf-token');
    const csrfCookie = getCookieValue(req.headers.cookie, CSRF_COOKIE_NAME);
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  }

  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use(express.json({ limit: '10mb' })); // large limit for base64 cover images & attachments
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const SESSION_COOKIE_NAME = 'ots_session';
const CSRF_COOKIE_NAME = 'ots_csrf';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const SESSION_SECRET = process.env.SESSION_SECRET;
const PASSWORD_KEYLEN = 64;
const PASSWORD_MIGRATION_WINDOW_DAYS = Math.max(0, Number(process.env.PASSWORD_MIGRATION_WINDOW_DAYS || '30'));
const PASSWORD_MIGRATION_WINDOW_MS = PASSWORD_MIGRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const LOGIN_MAX_FAILED_ATTEMPTS = Math.max(3, Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS || '5'));
const LOGIN_LOCKOUT_MINUTES = Math.max(1, Number(process.env.LOGIN_LOCKOUT_MINUTES || '15'));

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload: string): string {
  if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required');
  }
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, PASSWORD_KEYLEN);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function verifyPassword(password: string, encodedHash: string | null | undefined): boolean {
  if (!encodedHash || !encodedHash.startsWith('scrypt$')) return false;
  const parts = encodedHash.split('$');
  if (parts.length !== 3) return false;

  try {
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const derived = scryptSync(password, salt, expected.length);
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

function isLegacyFallbackAllowed(migratedAt: number | null | undefined): boolean {
  if (PASSWORD_MIGRATION_WINDOW_MS <= 0) return false;
  if (!migratedAt) return true;
  return Date.now() - migratedAt <= PASSWORD_MIGRATION_WINDOW_MS;
}

function createSessionToken(userId: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = base64UrlEncode(JSON.stringify({ userId, expiresAt }));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function verifySessionToken(token?: string): { userId: string; expiresAt: number } | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expectedSignature = signPayload(payload);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as { userId?: string; expiresAt?: number };
    if (!parsed.userId || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
      return null;
    }
    return { userId: parsed.userId, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return undefined;
}

function applySessionCookie(res: express.Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function applyCsrfCookie(res: express.Response, token: string): void {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function clearSessionCookie(res: express.Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

function issueCsrfToken(res: express.Response): string {
  const token = randomBytes(32).toString('base64url');
  applyCsrfCookie(res, token);
  return token;
}

function getBaseUrl(req: express.Request): string {
  const forwardedProto = req.header('x-forwarded-proto');
  const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = req.header('x-forwarded-host') || req.get('host') || '127.0.0.1:3001';
  return `${proto}://${host}`;
}

function sanitizeArticleContent(content: string): string {
  return sanitizeHtml(content || '', {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'code', 'pre', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div'
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    disallowedTagsMode: 'discard',
  });
}

function sanitizePlainText(value: string): string {
  return sanitizeHtml(value || '', {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

function logSecurityEvent(req: express.Request, event: string, details?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ip: req.ip,
    method: req.method,
    path: req.path,
    userAgent: req.get('user-agent') || '',
    ...details,
  };
  console.log(`[SECURITY] ${JSON.stringify(payload)}`);
}

async function getSessionUser(req: express.Request): Promise<SessionUser | null> {
  const db = await getDb();
  const token = getCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
  const session = verifySessionToken(token);
  if (!session) return null;

  const rows = db.exec("SELECT id, name, email, role, avatar FROM users WHERE id = ?", [session.userId]);
  if (!rows.length || !rows[0].values.length) return null;
  const row = rows[0].values[0];
  return {
    id: row[0] as string,
    name: row[1] as string,
    email: row[2] as string,
    role: row[3] as string,
    avatar: row[4] as string,
  };
}

function getCurrentUser(res: express.Response): SessionUser {
  return res.locals.currentUser as SessionUser;
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = await getSessionUser(req);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.locals.currentUser = user;
  next();
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (res.locals.currentUser as SessionUser) || await getSessionUser(req);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.locals.currentUser = user;
  next();
}

function requireSelfOrAdmin(paramKey: 'id' | 'userId') {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (res.locals.currentUser as SessionUser) || await getSessionUser(req);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (user.role !== 'admin' && user.id !== req.params[paramKey]) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.locals.currentUser = user;
    next();
  };
}

async function requireEditorOrAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (res.locals.currentUser as SessionUser) || await getSessionUser(req);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (user.role !== 'admin' && user.role !== 'editor') {
    return res.status(403).json({ error: 'Editor access required' });
  }
  res.locals.currentUser = user;
  next();
}

async function hasSectionEditAccess(userId: string, sectionId: string): Promise<boolean> {
  const db = await getDb();
  const rows = db.exec('SELECT 1 FROM section_editors WHERE user_id = ? AND section_id = ? LIMIT 1', [userId, sectionId]);
  return !!(rows.length && rows[0].values.length);
}

function requireSectionEditorOrAdminFromBody(sectionIdField = 'sectionId') {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (res.locals.currentUser as SessionUser) || await getSessionUser(req);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.role === 'admin') {
      res.locals.currentUser = user;
      return next();
    }

    const sectionId = String(req.body?.[sectionIdField] || '').trim();
    if (!sectionId) {
      return res.status(400).json({ error: 'sectionId is required' });
    }

    const allowed = user.role === 'editor' && await hasSectionEditAccess(user.id, sectionId);
    if (!allowed) {
      return res.status(403).json({ error: 'Section editor access required' });
    }

    res.locals.currentUser = user;
    next();
  };
}

function requireArticleEditorOrAdmin(articleIdParam = 'id') {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (res.locals.currentUser as SessionUser) || await getSessionUser(req);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.role === 'admin') {
      res.locals.currentUser = user;
      return next();
    }

    if (user.role !== 'editor') {
      return res.status(403).json({ error: 'Editor access required' });
    }

    const db = await getDb();
    const articleId = req.params[articleIdParam];
    const rows = db.exec('SELECT section_id FROM articles WHERE id = ?', [articleId]);
    if (!rows.length || !rows[0].values.length) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const sectionId = String(rows[0].values[0][0]);
    const allowed = await hasSectionEditAccess(user.id, sectionId);
    if (!allowed) {
      return res.status(403).json({ error: 'Section editor access required' });
    }

    res.locals.currentUser = user;
    next();
  };
}

async function requireAttachmentEditorOrAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (res.locals.currentUser as SessionUser) || await getSessionUser(req);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (user.role === 'admin') {
    res.locals.currentUser = user;
    return next();
  }

  if (user.role !== 'editor') {
    return res.status(403).json({ error: 'Editor access required' });
  }

  const db = await getDb();
  const rows = db.exec(
    'SELECT a.section_id FROM attachments att JOIN articles a ON a.id = att.article_id WHERE att.id = ? LIMIT 1',
    [req.params.id]
  );
  if (!rows.length || !rows[0].values.length) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  const sectionId = String(rows[0].values[0][0]);
  const allowed = await hasSectionEditAccess(user.id, sectionId);
  if (!allowed) {
    return res.status(403).json({ error: 'Section editor access required' });
  }

  res.locals.currentUser = user;
  next();
}

async function requireCommentEditorOrAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (res.locals.currentUser as SessionUser) || await getSessionUser(req);
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (user.role === 'admin') {
    res.locals.currentUser = user;
    return next();
  }

  if (user.role !== 'editor') {
    return res.status(403).json({ error: 'Editor access required' });
  }

  const db = await getDb();
  const rows = db.exec(
    'SELECT a.section_id FROM comments c JOIN articles a ON a.id = c.article_id WHERE c.id = ? LIMIT 1',
    [req.params.id]
  );
  if (!rows.length || !rows[0].values.length) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  const sectionId = String(rows[0].values[0][0]);
  const allowed = await hasSectionEditAccess(user.id, sectionId);
  if (!allowed) {
    return res.status(403).json({ error: 'Section editor access required' });
  }

  res.locals.currentUser = user;
  next();
}

async function migrateLegacyPasswords() {
  const db = await getDb();
  const rows = db.exec("SELECT id, password, password_hash, auth_source FROM users");
  if (!rows.length || !rows[0].values.length) return;

  let migrated = 0;
  for (const row of rows[0].values) {
    const userId = row[0] as string;
    const legacyPassword = (row[1] as string | null) || '';
    const passwordHash = row[2] as string | null;
    const authSource = (row[3] as string | null) || 'local';

    if (authSource !== 'local') continue;
    if (!legacyPassword || passwordHash) continue;

    db.run(
      'UPDATE users SET password_hash = ?, password_algo = ?, password_migrated_at = ?, must_reset_password = ?, auth_source = ? WHERE id = ?',
      [hashPassword(legacyPassword), 'scrypt', Date.now(), legacyPassword === 'password' ? 1 : 0, 'local', userId]
    );
    migrated += 1;
  }

  if (migrated > 0) {
    saveDb();
    console.log(`🔐 Migrated ${migrated} legacy plaintext passwords to salted hashes`);
  }
}

function mapRowToSamlConfig(row: any[], req: express.Request): SamlConfig {
  const baseUrl = getBaseUrl(req);
  const defaults = buildDefaultSamlConfig(baseUrl);
  return {
    providerType: ((row[0] as string) || defaults.providerType) as SamlConfig['providerType'],
    enabled: !!(row[1] as number),
    metadataMode: ((row[2] as string) || defaults.metadataMode) as SamlConfig['metadataMode'],
    metadataUrl: (row[3] as string) || '',
    metadataXml: (row[4] as string) || '',
    idpEntityId: (row[5] as string) || '',
    entryPoint: (row[6] as string) || '',
    idpCert: normalizePemCertificate((row[7] as string) || ''),
    logoutUrl: (row[8] as string) || '',
    spEntityId: (row[9] as string) || defaults.spEntityId,
    acsUrl: (row[10] as string) || defaults.acsUrl,
    nameIdFormat: (row[11] as string) || defaults.nameIdFormat,
    emailAttribute: (row[12] as string) || defaults.emailAttribute,
    displayNameAttribute: (row[13] as string) || defaults.displayNameAttribute,
  };
}

async function getSamlConfigForRequest(req: express.Request): Promise<SamlConfig> {
  const db = await getDb();
  const rows = db.exec('SELECT provider_type, enabled, metadata_mode, metadata_url, metadata_xml, idp_entity_id, entry_point, idp_cert, logout_url, sp_entity_id, acs_url, name_id_format, email_attribute, display_name_attribute FROM saml_config WHERE id = 1');
  if (!rows.length || !rows[0].values.length) {
    return buildDefaultSamlConfig(getBaseUrl(req));
  }
  return mapRowToSamlConfig(rows[0].values[0], req);
}

async function saveSamlConfig(config: SamlConfig): Promise<void> {
  const db = await getDb();
  const existing = db.exec('SELECT id FROM saml_config WHERE id = 1');
  if (existing.length && existing[0].values.length) {
    db.run(
      'UPDATE saml_config SET provider_type=?, enabled=?, metadata_mode=?, metadata_url=?, metadata_xml=?, idp_entity_id=?, entry_point=?, idp_cert=?, logout_url=?, sp_entity_id=?, acs_url=?, name_id_format=?, email_attribute=?, display_name_attribute=?, updated_at=? WHERE id=1',
      [
        config.providerType,
        config.enabled ? 1 : 0,
        config.metadataMode,
        config.metadataUrl,
        config.metadataXml,
        config.idpEntityId,
        config.entryPoint,
        normalizePemCertificate(config.idpCert),
        config.logoutUrl,
        config.spEntityId,
        config.acsUrl,
        config.nameIdFormat,
        config.emailAttribute,
        config.displayNameAttribute,
        Date.now(),
      ]
    );
  } else {
    db.run(
      'INSERT INTO saml_config (id, provider_type, enabled, metadata_mode, metadata_url, metadata_xml, idp_entity_id, entry_point, idp_cert, logout_url, sp_entity_id, acs_url, name_id_format, email_attribute, display_name_attribute, updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        config.providerType,
        config.enabled ? 1 : 0,
        config.metadataMode,
        config.metadataUrl,
        config.metadataXml,
        config.idpEntityId,
        config.entryPoint,
        normalizePemCertificate(config.idpCert),
        config.logoutUrl,
        config.spEntityId,
        config.acsUrl,
        config.nameIdFormat,
        config.emailAttribute,
        config.displayNameAttribute,
        Date.now(),
      ]
    );
  }
  saveDb();
}

// ─── USERS ───────────────────────────────────────────────
app.get('/api/csrf-token', async (_req, res) => {
  const token = issueCsrfToken(res);
  res.json({ csrfToken: token });
});

app.get('/api/users', requireAuth, requireAdmin, async (_req, res) => {
  const db = await getDb();
  const rows = db.exec("SELECT id, name, email, role, avatar, auth_source FROM users");
  if (!rows.length) return res.json([]);
  const users = rows[0].values.map(r => ({
    id: r[0], name: r[1], email: r[2], role: r[3], avatar: r[4], authSource: r[5] || 'local',
  }));
  res.json(users);
});

app.post('/api/users', authLimiter, async (req, res) => {
  const db = await getDb();
  const { name, email, password, avatar } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const id = (req.body?.id as string | undefined)?.trim() || `u_${randomUUID()}`;
  const safeName = sanitizePlainText(String(name)).slice(0, 100);
  const existing = db.exec("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length && existing[0].values.length) {
    logSecurityEvent(req, 'auth.register.duplicate_email', { email: String(email).toLowerCase() });
    return res.status(400).json({ error: 'Email already registered' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const safeAvatar = String(avatar || '').trim();
  const passwordHash = hashPassword(password);
  db.run(
    "INSERT INTO users (id, name, email, password, password_hash, password_algo, password_migrated_at, role, avatar, auth_source, must_reset_password) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [id, safeName, normalizedEmail, password, passwordHash, 'scrypt', Date.now(), 'user', safeAvatar, 'local', password === 'password' ? 1 : 0]
  );
  saveDb();
  logSecurityEvent(req, 'auth.register.success', { userId: id, email: normalizedEmail });
  res.json({ id, name: safeName, email: normalizedEmail, role: 'user', avatar: safeAvatar });
});

app.post('/api/login', authLimiter, async (req, res) => {
  const db = await getDb();
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const rows = db.exec(
    "SELECT id, name, email, password, password_hash, password_migrated_at, role, avatar, auth_source, failed_login_count, locked_until FROM users WHERE lower(email) = lower(?)",
    [normalizedEmail]
  );
  if (!rows.length || !rows[0].values.length) {
    logSecurityEvent(req, 'auth.login.failed_unknown_email', { email: normalizedEmail });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const row = rows[0].values[0];
  const userId = row[0] as string;
  const legacyPassword = row[3] as string | null;
  const passwordHash = row[4] as string | null;
  const migratedAt = row[5] as number | null;
  const authSource = (row[8] as string | null) || 'local';
  const failedLoginCount = Number(row[9] || 0);
  const lockedUntil = row[10] ? Number(row[10]) : null;

  if (lockedUntil && lockedUntil > Date.now()) {
    logSecurityEvent(req, 'auth.login.locked', { userId, email: normalizedEmail, lockedUntil });
    return res.status(423).json({ error: 'Account temporarily locked due to failed login attempts' });
  }

  let authenticated = false;
  if (authSource !== 'local') {
    logSecurityEvent(req, 'auth.login.failed_saml_only', { userId, email: normalizedEmail });
    return res.status(401).json({ error: 'Use SAML login for this account' });
  }

  if (verifyPassword(password, passwordHash)) {
    authenticated = true;
  } else if (legacyPassword && legacyPassword === password && isLegacyFallbackAllowed(migratedAt)) {
    authenticated = true;
    db.run(
      'UPDATE users SET password_hash = ?, password_algo = ?, password_migrated_at = ?, auth_source = ? WHERE id = ?',
      [hashPassword(password), 'scrypt', Date.now(), 'local', userId]
    );
    saveDb();
  }

  if (!authenticated) {
    const nextFailed = failedLoginCount + 1;
    const lockUntil = nextFailed >= LOGIN_MAX_FAILED_ATTEMPTS ? Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000 : null;
    db.run(
      'UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?',
      [nextFailed, lockUntil, userId]
    );
    saveDb();
    logSecurityEvent(req, 'auth.login.failed', { userId, email: normalizedEmail, failedAttempts: nextFailed, lockUntil });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  db.run('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?', [userId]);
  saveDb();

  const sessionToken = createSessionToken(userId);
  applySessionCookie(res, sessionToken);
  issueCsrfToken(res);
  logSecurityEvent(req, 'auth.login.success', { userId, email: normalizedEmail });
  res.json({ id: row[0], name: row[1], email: row[2], role: row[6], avatar: row[7] });
});

app.get('/api/session', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const db = await getDb();
  const token = getCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
  const session = verifySessionToken(token);
  if (!session) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'No active session' });
  }

  const rows = db.exec("SELECT id, name, email, role, avatar FROM users WHERE id = ?", [session.userId]);
  if (!rows.length || !rows[0].values.length) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'No active session' });
  }

  const row = rows[0].values[0];
  res.json({ id: row[0], name: row[1], email: row[2], role: row[3], avatar: row[4] });
});

app.post('/api/logout', async (_req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.put('/api/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const db = await getDb();
  const currentUser = getCurrentUser(res);
  const { role } = req.body;
  if (!role || !['guest', 'user', 'editor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  db.run("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id]);
  saveDb();
  logSecurityEvent(req, 'auth.role.updated', { actorUserId: currentUser.id, targetUserId: req.params.id, role });
  res.json({ success: true });
});

app.put('/api/users/:id/password', requireAuth, requireSelfOrAdmin('id'), async (req, res) => {
  const db = await getDb();
  const currentUser = getCurrentUser(res);
  const { password } = req.body;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const targetRows = db.exec('SELECT auth_source FROM users WHERE id = ?', [req.params.id]);
  if (!targetRows.length || !targetRows[0].values.length) {
    return res.status(404).json({ error: 'User not found' });
  }
  const targetAuthSource = (targetRows[0].values[0][0] as string) || 'local';
  if (targetAuthSource !== 'local') {
    return res.status(400).json({ error: 'Password reset is only available for local accounts' });
  }

  db.run(
    "UPDATE users SET password = ?, password_hash = ?, password_algo = ?, password_migrated_at = ?, auth_source = ?, must_reset_password = 0, failed_login_count = 0, locked_until = NULL WHERE id = ?",
    [password, hashPassword(password), 'scrypt', Date.now(), 'local', req.params.id]
  );
  saveDb();
  logSecurityEvent(req, 'auth.password.reset', { actorUserId: currentUser.id, targetUserId: req.params.id, byAdmin: currentUser.id !== req.params.id });
  res.json({ success: true });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const db = await getDb();
  const currentUser = getCurrentUser(res);
  db.run("DELETE FROM section_editors WHERE user_id = ?", [req.params.id]);
  db.run("DELETE FROM notifications WHERE user_id = ?", [req.params.id]);
  db.run("DELETE FROM digest_preferences WHERE user_id = ?", [req.params.id]);
  db.run("DELETE FROM users WHERE id = ?", [req.params.id]);
  saveDb();
  logSecurityEvent(req, 'auth.user.deleted', { actorUserId: currentUser.id, targetUserId: req.params.id });
  res.json({ success: true });
});

// ─── SECTIONS ────────────────────────────────────────────
app.get('/api/sections', async (_req, res) => {
  const db = await getDb();
  const sectionRows = db.exec("SELECT id, title FROM sections");
  const subRows = db.exec("SELECT id, title, section_id FROM subsections");

  const sections = (sectionRows[0]?.values || []).map(r => {
    const subs = (subRows[0]?.values || [])
      .filter(s => s[2] === r[0])
      .map(s => ({ id: s[0] as string, title: s[1] as string }));
    return {
      id: r[0] as string,
      title: r[1] as string,
      subsections: subs.length > 0 ? subs : undefined,
    };
  });
  res.json(sections);
});

app.post('/api/sections', requireAuth, requireAdmin, async (req, res) => {
  const db = await getDb();
  const { id, title } = req.body;
  db.run("INSERT INTO sections (id, title) VALUES (?,?)", [id, title]);
  saveDb();
  res.json({ id, title, subsections: [] });
});

app.delete('/api/sections/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    db.run("DELETE FROM section_editors WHERE section_id = ?", [req.params.id]);
    db.run("DELETE FROM subsections WHERE section_id = ?", [req.params.id]);
    db.run("DELETE FROM sections WHERE id = ?", [req.params.id]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete section:', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

app.post('/api/sections/:sectionId/subsections', requireAuth, requireAdmin, async (req, res) => {
  const db = await getDb();
  const { id, title } = req.body;
  db.run("INSERT INTO subsections (id, title, section_id) VALUES (?,?,?)", [id, title, req.params.sectionId]);
  saveDb();
  res.json({ id, title });
});

// ─── ARTICLES ────────────────────────────────────────────

// Helper: build full article objects with comments, tags, attachments
async function buildArticles(db: any, whereClause = '', params: any[] = []) {
  const artRows = db.exec(`SELECT id, title, content, excerpt, section_id, subsection_id, author_id, author_name, timestamp, image_url, allow_comments, status FROM articles ${whereClause} ORDER BY timestamp DESC`, params);
  const comRows = db.exec("SELECT id, article_id, author_id, author_name, author_avatar, content, timestamp, parent_id FROM comments ORDER BY timestamp ASC");
  const tagRows = db.exec("SELECT article_id, tag FROM tags");
  const attRows = db.exec("SELECT id, article_id, filename, data, mime_type FROM attachments");

  const comments = (comRows[0]?.values || []).map((c: any) => ({
    id: c[0] as string,
    articleId: c[1] as string,
    authorId: c[2] as string,
    authorName: c[3] as string,
    authorAvatar: c[4] as string,
    content: sanitizePlainText(c[5] as string),
    timestamp: c[6] as number,
    parentId: c[7] as string | null || undefined,
  }));

  const tags = (tagRows[0]?.values || []).map((t: any) => ({
    articleId: t[0] as string,
    tag: t[1] as string,
  }));

  const attachments = (attRows[0]?.values || []).map((a: any) => ({
    id: a[0] as string,
    articleId: a[1] as string,
    filename: a[2] as string,
    data: a[3] as string,
    mimeType: a[4] as string,
  }));

  const articles = (artRows[0]?.values || []).map((r: any) => ({
    id: r[0] as string,
    title: r[1] as string,
    content: sanitizeArticleContent(r[2] as string),
    excerpt: sanitizePlainText(r[3] as string),
    sectionId: r[4] as string,
    subsectionId: r[5] as string | null || undefined,
    authorId: r[6] as string,
    authorName: r[7] as string,
    timestamp: r[8] as number,
    imageUrl: r[9] as string | null || undefined,
    allowComments: !!(r[10] as number),
    status: r[11] as string,
    comments: comments.filter((c: any) => c.articleId === r[0]).map(({ articleId, ...rest }: any) => rest),
    tags: tags.filter((t: any) => t.articleId === r[0]).map((t: any) => t.tag),
    attachments: attachments.filter((a: any) => a.articleId === r[0]).map(({ articleId, ...rest }: any) => rest),
  }));

  return articles;
}

app.get('/api/articles', async (req, res) => {
  const db = await getDb();
  const user = await getSessionUser(req);
  let whereClause = "WHERE status = 'published'";
  const params: any[] = [];

  if (user) {
    if (user.role === 'admin' || user.role === 'editor') {
      whereClause = '';
    } else {
      whereClause = "WHERE status = 'published' OR author_id = ?";
      params.push(user.id);
    }
  }

  const articles = await buildArticles(db, whereClause, params);
  res.json(articles);
});

app.get('/api/articles/search', async (req, res) => {
  const db = await getDb();
  const user = await getSessionUser(req);
  const q = (req.query.q as string || '').trim();

  const canViewAll = !!user && (user.role === 'admin' || user.role === 'editor');
  const scopedWhere = user && !canViewAll ? "status = 'published' OR author_id = ?" : "status = 'published'";

  if (!q) {
    const whereClause = canViewAll ? '' : `WHERE ${scopedWhere}`;
    const params = user && !canViewAll ? [user.id] : [];
    const articles = await buildArticles(db, whereClause, params);
    return res.json(articles);
  }

  const pattern = `%${q}%`;
  const whereParts = ['(title LIKE ? OR excerpt LIKE ? OR content LIKE ?)'];
  const params: any[] = [pattern, pattern, pattern];

  if (!canViewAll) {
    whereParts.push(`(${scopedWhere})`);
    if (user) {
      params.push(user.id);
    }
  }

  const articles = await buildArticles(db, `WHERE ${whereParts.join(' AND ')}`, params);
  res.json(articles);
});

app.post('/api/articles', requireAuth, requireSectionEditorOrAdminFromBody('sectionId'), async (req, res) => {
  const db = await getDb();
  const a = req.body;
  const currentUser = getCurrentUser(res);
  const safeContent = sanitizeArticleContent(String(a.content || ''));
  const safeTitle = sanitizePlainText(String(a.title || '')).slice(0, 300);
  const safeExcerpt = sanitizePlainText(String(a.excerpt || '')).slice(0, 1000);
  a.authorId = currentUser.id;
  a.authorName = currentUser.name;
  a.title = safeTitle;
  a.content = safeContent;
  a.excerpt = safeExcerpt;
  db.run(
    "INSERT INTO articles (id, title, content, excerpt, section_id, subsection_id, author_id, author_name, timestamp, image_url, allow_comments, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [a.id, a.title, a.content, a.excerpt, a.sectionId, a.subsectionId || null, a.authorId, a.authorName, a.timestamp, a.imageUrl || null, a.allowComments ? 1 : 0, a.status || 'published']
  );
  // Insert tags
  if (a.tags && Array.isArray(a.tags)) {
    for (const tag of a.tags) {
      db.run("INSERT OR IGNORE INTO tags (article_id, tag) VALUES (?, ?)", [a.id, tag.toLowerCase().trim()]);
    }
  }
  // Create notifications for all users when article is published
  if (a.status === 'published') {
    const userRows = db.exec("SELECT id FROM users WHERE id != ?", [a.authorId]);
    if (userRows.length && userRows[0].values.length) {
      for (const row of userRows[0].values) {
        const nId = `n_${Date.now()}_${row[0]}`;
        db.run(
          "INSERT INTO notifications (id, user_id, type, message, article_id, timestamp, read) VALUES (?,?,?,?,?,?,?)",
          [nId, row[0], 'new_article', `${a.authorName} published "${a.title}"`, a.id, Date.now(), 0]
        );
      }
    }
  }
  saveDb();
  res.json(a);
});

app.put('/api/articles/:id', requireAuth, requireArticleEditorOrAdmin('id'), async (req, res) => {
  const db = await getDb();
  const a = req.body;
  const currentUser = getCurrentUser(res);
  const safeContent = sanitizeArticleContent(String(a.content || ''));
  const safeTitle = sanitizePlainText(String(a.title || '')).slice(0, 300);
  const safeExcerpt = sanitizePlainText(String(a.excerpt || '')).slice(0, 1000);
  a.authorId = currentUser.id;
  a.authorName = currentUser.name;
  a.title = safeTitle;
  a.content = safeContent;
  a.excerpt = safeExcerpt;

  // Check if the article was previously draft and is now published
  const prevRows = db.exec("SELECT status, author_id FROM articles WHERE id = ?", [req.params.id]);
  const wasDraft = prevRows.length && prevRows[0].values.length && prevRows[0].values[0][0] === 'draft';
  const nowPublished = a.status === 'published';

  db.run(
    "UPDATE articles SET title=?, content=?, excerpt=?, section_id=?, subsection_id=?, author_id=?, author_name=?, timestamp=?, image_url=?, allow_comments=?, status=? WHERE id=?",
    [a.title, a.content, a.excerpt, a.sectionId, a.subsectionId || null, a.authorId, a.authorName, a.timestamp, a.imageUrl || null, a.allowComments ? 1 : 0, a.status || 'published', req.params.id]
  );
  // Sync tags: delete old, insert new
  db.run("DELETE FROM tags WHERE article_id = ?", [req.params.id]);
  if (a.tags && Array.isArray(a.tags)) {
    for (const tag of a.tags) {
      db.run("INSERT OR IGNORE INTO tags (article_id, tag) VALUES (?, ?)", [req.params.id, tag.toLowerCase().trim()]);
    }
  }
  // Notify on publish from draft
  if (wasDraft && nowPublished) {
    const userRows = db.exec("SELECT id FROM users WHERE id != ?", [a.authorId]);
    if (userRows.length && userRows[0].values.length) {
      for (const row of userRows[0].values) {
        const nId = `n_${Date.now()}_${row[0]}`;
        db.run(
          "INSERT INTO notifications (id, user_id, type, message, article_id, timestamp, read) VALUES (?,?,?,?,?,?,?)",
          [nId, row[0], 'new_article', `${a.authorName} published "${a.title}"`, req.params.id, Date.now(), 0]
        );
      }
    }
  }
  saveDb();
  res.json(a);
});

app.delete('/api/articles/:id', requireAuth, requireArticleEditorOrAdmin('id'), async (req, res) => {
  const db = await getDb();
  db.run("DELETE FROM tags WHERE article_id = ?", [req.params.id]);
  db.run("DELETE FROM attachments WHERE article_id = ?", [req.params.id]);
  db.run("DELETE FROM comments WHERE article_id = ?", [req.params.id]);
  db.run("DELETE FROM notifications WHERE article_id = ?", [req.params.id]);
  db.run("DELETE FROM articles WHERE id = ?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ─── TAGS ────────────────────────────────────────────────
app.get('/api/tags', async (_req, res) => {
  const db = await getDb();
  const rows = db.exec("SELECT DISTINCT tag FROM tags ORDER BY tag ASC");
  if (!rows.length) return res.json([]);
  const tags = rows[0].values.map(r => r[0] as string);
  res.json(tags);
});

// ─── ATTACHMENTS ─────────────────────────────────────────
app.post('/api/articles/:articleId/attachments', requireAuth, requireArticleEditorOrAdmin('articleId'), async (req, res) => {
  const db = await getDb();
  const { id, filename, data, mimeType } = req.body;
  const safeFilename = sanitizePlainText(String(filename || '')).slice(0, 255);
  const safeMimeType = String(mimeType || '').trim().toLowerCase();

  if (!safeFilename || !data || !safeMimeType) {
    return res.status(400).json({ error: 'Attachment filename, data, and mimeType are required' });
  }

  const allowedMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']);
  if (!allowedMimeTypes.has(safeMimeType)) {
    return res.status(400).json({ error: 'Unsupported attachment type' });
  }

  const maxBase64Length = 8 * 1024 * 1024;
  if (String(data).length > maxBase64Length) {
    return res.status(400).json({ error: 'Attachment too large' });
  }

  db.run(
    "INSERT INTO attachments (id, article_id, filename, data, mime_type) VALUES (?,?,?,?,?)",
    [id, req.params.articleId, safeFilename, data, safeMimeType]
  );
  saveDb();
  res.json({ id, filename: safeFilename, data, mimeType: safeMimeType });
});

app.delete('/api/attachments/:id', requireAuth, requireAttachmentEditorOrAdmin, async (req, res) => {
  const db = await getDb();
  db.run("DELETE FROM attachments WHERE id = ?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ─── COMMENTS ────────────────────────────────────────────
app.post('/api/articles/:articleId/comments', requireAuth, async (req, res) => {
  const db = await getDb();
  const c = req.body;
  const currentUser = getCurrentUser(res);
  const safeContent = sanitizePlainText(String(c.content || '')).slice(0, 4000);
  if (!safeContent) {
    return res.status(400).json({ error: 'Comment content is required' });
  }
  c.authorId = currentUser.id;
  c.authorName = currentUser.name;
  c.authorAvatar = currentUser.avatar;
  c.content = safeContent;
  db.run(
    "INSERT INTO comments (id, article_id, author_id, author_name, author_avatar, content, timestamp, parent_id) VALUES (?,?,?,?,?,?,?,?)",
    [c.id, req.params.articleId, c.authorId, c.authorName, c.authorAvatar, c.content, c.timestamp, c.parentId || null]
  );

  // Create notification for article author (if commenter != author)
  const artRows = db.exec("SELECT author_id, title FROM articles WHERE id = ?", [req.params.articleId]);
  if (artRows.length && artRows[0].values.length) {
    const articleAuthorId = artRows[0].values[0][0] as string;
    const articleTitle = artRows[0].values[0][1] as string;
    if (articleAuthorId !== c.authorId) {
      const nId = `n_${Date.now()}_comment`;
      db.run(
        "INSERT INTO notifications (id, user_id, type, message, article_id, timestamp, read) VALUES (?,?,?,?,?,?,?)",
        [nId, articleAuthorId, 'comment_on_article', `${c.authorName} commented on "${articleTitle}"`, req.params.articleId, Date.now(), 0]
      );
    }
  }

  // If it's a reply, notify the parent comment author too
  if (c.parentId) {
    const parentRows = db.exec("SELECT author_id FROM comments WHERE id = ?", [c.parentId]);
    if (parentRows.length && parentRows[0].values.length) {
      const parentAuthorId = parentRows[0].values[0][0] as string;
      if (parentAuthorId !== c.authorId) {
        const artTitle = artRows.length ? artRows[0].values[0][1] as string : 'an article';
        const nId = `n_${Date.now()}_reply`;
        db.run(
          "INSERT INTO notifications (id, user_id, type, message, article_id, timestamp, read) VALUES (?,?,?,?,?,?,?)",
          [nId, parentAuthorId, 'comment_reply', `${c.authorName} replied to your comment on "${artTitle}"`, req.params.articleId, Date.now(), 0]
        );
      }
    }
  }

  saveDb();
  res.json(c);
});

app.delete('/api/comments/:id', requireAuth, requireCommentEditorOrAdmin, async (req, res) => {
  const db = await getDb();
  // Also delete child replies
  db.run("DELETE FROM comments WHERE parent_id = ?", [req.params.id]);
  db.run("DELETE FROM comments WHERE id = ?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ─── NOTIFICATIONS ───────────────────────────────────────
app.get('/api/notifications/:userId', requireAuth, requireSelfOrAdmin('userId'), async (req, res) => {
  const db = await getDb();
  const rows = db.exec(
    "SELECT id, user_id, type, message, article_id, timestamp, read FROM notifications WHERE user_id = ? ORDER BY timestamp DESC",
    [req.params.userId]
  );
  if (!rows.length) return res.json([]);
  const notifications = rows[0].values.map(r => ({
    id: r[0] as string,
    userId: r[1] as string,
    type: r[2] as string,
    message: r[3] as string,
    articleId: r[4] as string | null || undefined,
    timestamp: r[5] as number,
    read: !!(r[6] as number),
  }));
  res.json(notifications);
});

app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
  const db = await getDb();
  const currentUser = getCurrentUser(res);
  if (currentUser.role === 'admin') {
    db.run("UPDATE notifications SET read = 1 WHERE id = ?", [req.params.id]);
  } else {
    db.run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", [req.params.id, currentUser.id]);
  }
  saveDb();
  res.json({ success: true });
});

app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  const db = await getDb();
  const { userId } = req.body;
  const currentUser = getCurrentUser(res);
  if (currentUser.role !== 'admin' && userId !== currentUser.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.run("UPDATE notifications SET read = 1 WHERE user_id = ?", [userId]);
  saveDb();
  res.json({ success: true });
});

// ─── DIGEST PREFERENCES ─────────────────────────────────
app.get('/api/digest/:userId', requireAuth, requireSelfOrAdmin('userId'), async (req, res) => {
  const db = await getDb();
  const rows = db.exec("SELECT user_id, enabled, frequency FROM digest_preferences WHERE user_id = ?", [req.params.userId]);
  if (!rows.length || !rows[0].values.length) {
    return res.json({ userId: req.params.userId, enabled: false, frequency: 'weekly' });
  }
  const r = rows[0].values[0];
  res.json({ userId: r[0], enabled: !!(r[1] as number), frequency: r[2] });
});

app.put('/api/digest/:userId', requireAuth, requireSelfOrAdmin('userId'), async (req, res) => {
  const db = await getDb();
  const { enabled, frequency } = req.body;
  const existing = db.exec("SELECT user_id FROM digest_preferences WHERE user_id = ?", [req.params.userId]);
  if (existing.length && existing[0].values.length) {
    db.run("UPDATE digest_preferences SET enabled = ?, frequency = ? WHERE user_id = ?", [enabled ? 1 : 0, frequency, req.params.userId]);
  } else {
    db.run("INSERT INTO digest_preferences (user_id, enabled, frequency) VALUES (?,?,?)", [req.params.userId, enabled ? 1 : 0, frequency]);
  }
  saveDb();
  res.json({ userId: req.params.userId, enabled, frequency });
});

// ─── SECTION EDITORS ─────────────────────────────────────
app.get('/api/section-editors', requireAuth, async (req, res) => {
  const db = await getDb();
  const currentUser = getCurrentUser(res);
  const rows = currentUser.role === 'admin'
    ? db.exec("SELECT user_id, section_id FROM section_editors")
    : db.exec("SELECT user_id, section_id FROM section_editors WHERE user_id = ?", [currentUser.id]);
  if (!rows.length) return res.json([]);
  const editors = rows[0].values.map(r => ({
    userId: r[0] as string,
    sectionId: r[1] as string,
  }));
  res.json(editors);
});

app.post('/api/section-editors', requireAuth, requireAdmin, async (req, res) => {
  const db = await getDb();
  const { userId, sectionId } = req.body;
  const existing = db.exec("SELECT user_id FROM section_editors WHERE user_id = ? AND section_id = ?", [userId, sectionId]);
  if (existing.length && existing[0].values.length) {
    return res.status(400).json({ error: 'User is already an editor of this section' });
  }
  db.run("INSERT INTO section_editors (user_id, section_id) VALUES (?, ?)", [userId, sectionId]);
  saveDb();
  res.json({ userId, sectionId });
});

app.delete('/api/section-editors', requireAuth, requireAdmin, async (req, res) => {
  const db = await getDb();
  const { userId, sectionId } = req.body;
  db.run("DELETE FROM section_editors WHERE user_id = ? AND section_id = ?", [userId, sectionId]);
  saveDb();
  res.json({ success: true });
});

// ─── EMAIL CONFIG ────────────────────────────────────────
app.get('/api/email-config', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const config = await getEmailConfig();
    if (!config) return res.json(null);
    res.json({ ...config, password: config.password ? '••••••••' : '' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load email configuration' });
  }
});

app.put('/api/email-config', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const currentUser = getCurrentUser(res);
    const c = req.body as EmailConfig;

    let password = c.password;
    if (password === '••••••••') {
      const existing = await getEmailConfig();
      password = existing?.password || '';
    }
    const encryptedPassword = encryptSecretForStorage(password || '');

    const existing = db.exec('SELECT id FROM email_config WHERE id = 1');
    if (existing.length && existing[0].values.length) {
      db.run(
        'UPDATE email_config SET provider=?, smtp_host=?, smtp_port=?, username=?, password=?, encryption=?, from_address=?, from_name=?, enabled=?, updated_at=? WHERE id=1',
        [c.provider, c.smtpHost, c.smtpPort, c.username, encryptedPassword, c.encryption, c.fromAddress, c.fromName, c.enabled ? 1 : 0, Date.now()]
      );
    } else {
      db.run(
        'INSERT INTO email_config (id, provider, smtp_host, smtp_port, username, password, encryption, from_address, from_name, enabled, updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?)',
        [c.provider, c.smtpHost, c.smtpPort, c.username, encryptedPassword, c.encryption, c.fromAddress, c.fromName, c.enabled ? 1 : 0, Date.now()]
      );
    }
    saveDb();
    logSecurityEvent(req, 'config.email.updated', { actorUserId: currentUser.id, provider: c.provider, enabled: !!c.enabled });
    res.json({ ...c, password: '••••••••' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save email configuration' });
  }
});

app.post('/api/email-config/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const c = req.body as EmailConfig & { testEmailTo?: string };

    let password = c.password;
    if (password === '••••••••') {
      const existing = await getEmailConfig();
      password = existing?.password || '';
    }
    const configForTest: EmailConfig = { ...c, password };

    const connResult = await testConnection(configForTest);
    if (!connResult.success) {
      return res.json({ success: false, error: connResult.error });
    }

    if (c.testEmailTo) {
      const sendResult = await sendTestEmail(configForTest, c.testEmailTo);
      return res.json(sendResult);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Email test failed' });
  }
});

// ─── SAML CONFIG ────────────────────────────────────────
app.get('/api/saml-config/public', async (req, res) => {
  const config = await getSamlConfigForRequest(req);
  const metadataUrl = `${getBaseUrl(req)}/api/auth/saml/metadata`;
  res.json({
    enabled: config.enabled,
    metadataUrl,
    spEntityId: config.spEntityId,
    acsUrl: config.acsUrl,
  });
});

app.get('/api/saml-config', requireAdmin, async (req, res) => {
  const config = await getSamlConfigForRequest(req);
  res.json(config);
});

app.put('/api/saml-config', requireAdmin, async (req, res) => {
  try {
    const baseDefaults = buildDefaultSamlConfig(getBaseUrl(req));
    const incoming = req.body as SamlConfig;

    const merged: SamlConfig = {
      ...baseDefaults,
      ...incoming,
      metadataUrl: (incoming.metadataUrl || '').trim(),
      metadataXml: (incoming.metadataXml || '').trim(),
      spEntityId: (incoming.spEntityId || baseDefaults.spEntityId).trim(),
      acsUrl: (incoming.acsUrl || baseDefaults.acsUrl).trim(),
      nameIdFormat: (incoming.nameIdFormat || baseDefaults.nameIdFormat).trim(),
      emailAttribute: (incoming.emailAttribute || baseDefaults.emailAttribute).trim(),
      displayNameAttribute: (incoming.displayNameAttribute || baseDefaults.displayNameAttribute).trim(),
    };

    const hydrated = await hydrateSamlConfigFromMetadata(merged);
    await saveSamlConfig(hydrated);
    res.json(hydrated);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to save SAML configuration' });
  }
});

app.post('/api/saml-config/test', requireAdmin, async (req, res) => {
  try {
    const metadataMode = (req.body?.metadataMode || 'url') as 'url' | 'xml';
    const baseDefaults = buildDefaultSamlConfig(getBaseUrl(req));
    const hydrated = await hydrateSamlConfigFromMetadata({
      ...baseDefaults,
      metadataMode,
      metadataUrl: req.body?.metadataUrl || '',
      metadataXml: req.body?.metadataXml || '',
    });

    res.json({
      success: true,
      parsed: {
        idpEntityId: hydrated.idpEntityId,
        entryPoint: hydrated.entryPoint,
        idpCert: hydrated.idpCert,
        logoutUrl: hydrated.logoutUrl,
      },
    });
  } catch (err: any) {
    res.json({ success: false, error: err?.message || 'SAML metadata test failed' });
  }
});

// ─── SAML AUTH ──────────────────────────────────────────
app.get('/api/auth/saml/metadata', async (req, res) => {
  const config = await getSamlConfigForRequest(req);
  const xml = generateSpMetadataXml(config);
  res.type('application/samlmetadata+xml').send(xml);
});

app.get('/api/auth/saml/login', async (req, res) => {
  const config = await getSamlConfigForRequest(req);
  if (!config.enabled) {
    return res.status(403).send('SAML login is disabled');
  }
  if (!config.entryPoint || !config.idpCert) {
    return res.status(400).send('SAML is not fully configured');
  }

  try {
    const samlClient = createSamlClient(config);
    const relayState = typeof req.query.RelayState === 'string' ? req.query.RelayState : '/';
    const redirectUrl = await samlClient.getAuthorizeUrlAsync(relayState, undefined, {});
    res.redirect(redirectUrl);
  } catch (err: any) {
    console.error('SAML login redirect error:', err);
    res.status(500).send('Failed to start SAML login');
  }
});

app.post('/api/auth/saml/callback', async (req, res) => {
  const config = await getSamlConfigForRequest(req);
  if (!config.enabled) {
    return res.status(403).send('SAML login is disabled');
  }

  try {
    const samlClient = createSamlClient(config);
    const result = await samlClient.validatePostResponseAsync({
      SAMLResponse: req.body?.SAMLResponse,
      RelayState: req.body?.RelayState,
    });

    const profile = result.profile as Record<string, unknown> | null;
    if (!profile) {
      return res.status(401).send('SAML response did not contain a user profile');
    }

    const { email, displayName } = extractIdentity(profile, config);
    if (!email) {
      return res.status(400).send('Could not determine user email from SAML assertion');
    }

    const db = await getDb();
    let rows = db.exec('SELECT id, name, email, role, avatar FROM users WHERE lower(email) = lower(?)', [email]);

    if (!rows.length || !rows[0].values.length) {
      const userId = `u_saml_${Date.now()}`;
      const avatarSeed = encodeURIComponent(email.split('@')[0] || 'samluser');
      db.run(
        'INSERT INTO users (id, name, email, password, password_hash, password_algo, password_migrated_at, role, avatar, auth_source, must_reset_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, displayName || 'SAML User', email, '', null, null, null, 'user', `https://picsum.photos/seed/${avatarSeed}/50/50`, 'saml', 0]
      );
      saveDb();
      rows = db.exec('SELECT id, name, email, role, avatar FROM users WHERE id = ?', [userId]);
    }

    const userRow = rows[0].values[0];
    const sessionToken = createSessionToken(userRow[0] as string);
    applySessionCookie(res, sessionToken);
    issueCsrfToken(res);

    const relayState = typeof req.body?.RelayState === 'string' ? req.body.RelayState : '/';
    const safeRedirect = relayState.startsWith('/') ? relayState : '/';
    res.redirect(safeRedirect);
  } catch (err: any) {
    console.error('SAML callback error:', err);
    res.status(401).send(`SAML authentication failed: ${err?.message || 'Unknown error'}`);
  }
});

// ─── START ───────────────────────────────────────────────
const PORT = 3001;

async function start() {
  if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required');
  }

  await getDb();
  await migrateLegacyPasswords();
  console.log('📦 SQLite database initialized');

  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ OTS NEWS API server running on http://127.0.0.1:${PORT}`);
  });

  server.on('error', (err: Error) => {
    console.error('❌ Server error:', err);
  });

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    server.close();
    process.exit(0);
  });
}

start().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
