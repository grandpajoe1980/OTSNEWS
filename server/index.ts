import express from 'express';
import cors from 'cors';
import { getDb, saveDb } from './db';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // large limit for base64 cover images

// ─── USERS ───────────────────────────────────────────────
app.get('/api/users', async (_req, res) => {
  const db = await getDb();
  const rows = db.exec("SELECT id, name, email, role, avatar FROM users");
  if (!rows.length) return res.json([]);
  const users = rows[0].values.map(r => ({
    id: r[0], name: r[1], email: r[2], role: r[3], avatar: r[4],
  }));
  res.json(users);
});

app.post('/api/users', async (req, res) => {
  const db = await getDb();
  const { id, name, email, password, role, avatar } = req.body;
  // Check if email already exists
  const existing = db.exec("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length && existing[0].values.length) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  db.run("INSERT INTO users (id, name, email, password, role, avatar) VALUES (?,?,?,?,?,?)", [id, name, email, password || 'password', role || 'user', avatar]);
  saveDb();
  res.json({ id, name, email, role: role || 'user', avatar });
});

app.post('/api/login', async (req, res) => {
  const db = await getDb();
  const { email, password } = req.body;
  const rows = db.exec("SELECT id, name, email, password, role, avatar FROM users WHERE email = ?", [email]);
  if (!rows.length || !rows[0].values.length) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const row = rows[0].values[0];
  if (row[3] !== password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ id: row[0], name: row[1], email: row[2], role: row[4], avatar: row[5] });
});

app.put('/api/users/:id/role', async (req, res) => {
  const db = await getDb();
  const { role } = req.body;
  db.run("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/users/:id', async (req, res) => {
  const db = await getDb();
  db.run("DELETE FROM users WHERE id = ?", [req.params.id]);
  saveDb();
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

app.post('/api/sections', async (req, res) => {
  const db = await getDb();
  const { id, title } = req.body;
  db.run("INSERT INTO sections (id, title) VALUES (?,?)", [id, title]);
  saveDb();
  res.json({ id, title, subsections: [] });
});

app.delete('/api/sections/:id', async (req, res) => {
  try {
    const db = await getDb();
    db.run("DELETE FROM subsections WHERE section_id = ?", [req.params.id]);
    db.run("DELETE FROM sections WHERE id = ?", [req.params.id]);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete section:', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

app.post('/api/sections/:sectionId/subsections', async (req, res) => {
  const db = await getDb();
  const { id, title } = req.body;
  db.run("INSERT INTO subsections (id, title, section_id) VALUES (?,?,?)", [id, title, req.params.sectionId]);
  saveDb();
  res.json({ id, title });
});

// ─── ARTICLES ────────────────────────────────────────────
app.get('/api/articles', async (_req, res) => {
  const db = await getDb();
  const artRows = db.exec("SELECT id, title, content, excerpt, section_id, subsection_id, author_id, author_name, timestamp, image_url, allow_comments FROM articles ORDER BY timestamp DESC");
  const comRows = db.exec("SELECT id, article_id, author_id, author_name, author_avatar, content, timestamp FROM comments ORDER BY timestamp ASC");

  const comments = (comRows[0]?.values || []).map(c => ({
    id: c[0] as string,
    articleId: c[1] as string,
    authorId: c[2] as string,
    authorName: c[3] as string,
    authorAvatar: c[4] as string,
    content: c[5] as string,
    timestamp: c[6] as number,
  }));

  const articles = (artRows[0]?.values || []).map(r => ({
    id: r[0] as string,
    title: r[1] as string,
    content: r[2] as string,
    excerpt: r[3] as string,
    sectionId: r[4] as string,
    subsectionId: r[5] as string | null || undefined,
    authorId: r[6] as string,
    authorName: r[7] as string,
    timestamp: r[8] as number,
    imageUrl: r[9] as string | null || undefined,
    allowComments: !!(r[10] as number),
    comments: comments.filter(c => c.articleId === r[0]).map(({ articleId, ...rest }) => rest),
  }));

  res.json(articles);
});

app.post('/api/articles', async (req, res) => {
  const db = await getDb();
  const a = req.body;
  db.run(
    "INSERT INTO articles (id, title, content, excerpt, section_id, subsection_id, author_id, author_name, timestamp, image_url, allow_comments) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [a.id, a.title, a.content, a.excerpt, a.sectionId, a.subsectionId || null, a.authorId, a.authorName, a.timestamp, a.imageUrl || null, a.allowComments ? 1 : 0]
  );
  saveDb();
  res.json(a);
});

app.put('/api/articles/:id', async (req, res) => {
  const db = await getDb();
  const a = req.body;
  db.run(
    "UPDATE articles SET title=?, content=?, excerpt=?, section_id=?, subsection_id=?, author_id=?, author_name=?, timestamp=?, image_url=?, allow_comments=? WHERE id=?",
    [a.title, a.content, a.excerpt, a.sectionId, a.subsectionId || null, a.authorId, a.authorName, a.timestamp, a.imageUrl || null, a.allowComments ? 1 : 0, req.params.id]
  );
  saveDb();
  res.json(a);
});

app.delete('/api/articles/:id', async (req, res) => {
  const db = await getDb();
  db.run("DELETE FROM comments WHERE article_id = ?", [req.params.id]);
  db.run("DELETE FROM articles WHERE id = ?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ─── COMMENTS ────────────────────────────────────────────
app.post('/api/articles/:articleId/comments', async (req, res) => {
  const db = await getDb();
  const c = req.body;
  db.run(
    "INSERT INTO comments (id, article_id, author_id, author_name, author_avatar, content, timestamp) VALUES (?,?,?,?,?,?,?)",
    [c.id, req.params.articleId, c.authorId, c.authorName, c.authorAvatar, c.content, c.timestamp]
  );
  saveDb();
  res.json(c);
});

// ─── START ───────────────────────────────────────────────
const PORT = 3001;

async function start() {
  // Pre-initialize the database so it's ready before any requests
  await getDb();
  console.log('📦 SQLite database initialized');

  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ OTS NEWS API server running on http://127.0.0.1:${PORT}`);
  });

  server.on('error', (err: Error) => {
    console.error('❌ Server error:', err);
  });

  // Keep process alive
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
