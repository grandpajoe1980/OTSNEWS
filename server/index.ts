import express from 'express';
import cors from 'cors';
import { getDb, saveDb } from './db';
import { getEmailConfig, testConnection, sendTestEmail } from './email';
import type { EmailConfig } from '../types';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // large limit for base64 cover images & attachments

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

app.put('/api/users/:id/password', async (req, res) => {
  const db = await getDb();
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  db.run("UPDATE users SET password = ? WHERE id = ?", [password, req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/users/:id', async (req, res) => {
  const db = await getDb();
  db.run("DELETE FROM section_editors WHERE user_id = ?", [req.params.id]);
  db.run("DELETE FROM notifications WHERE user_id = ?", [req.params.id]);
  db.run("DELETE FROM digest_preferences WHERE user_id = ?", [req.params.id]);
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

app.post('/api/sections/:sectionId/subsections', async (req, res) => {
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
    content: c[5] as string,
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
    content: r[2] as string,
    excerpt: r[3] as string,
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

app.get('/api/articles', async (_req, res) => {
  const db = await getDb();
  const articles = await buildArticles(db);
  res.json(articles);
});

app.get('/api/articles/search', async (req, res) => {
  const db = await getDb();
  const q = (req.query.q as string || '').trim();
  if (!q) {
    const articles = await buildArticles(db);
    return res.json(articles);
  }
  const pattern = `%${q}%`;
  const articles = await buildArticles(db, "WHERE (title LIKE ? OR excerpt LIKE ? OR content LIKE ?) AND status = 'published'", [pattern, pattern, pattern]);
  res.json(articles);
});

app.post('/api/articles', async (req, res) => {
  const db = await getDb();
  const a = req.body;
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

app.put('/api/articles/:id', async (req, res) => {
  const db = await getDb();
  const a = req.body;

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

app.delete('/api/articles/:id', async (req, res) => {
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
app.post('/api/articles/:articleId/attachments', async (req, res) => {
  const db = await getDb();
  const { id, filename, data, mimeType } = req.body;
  db.run(
    "INSERT INTO attachments (id, article_id, filename, data, mime_type) VALUES (?,?,?,?,?)",
    [id, req.params.articleId, filename, data, mimeType]
  );
  saveDb();
  res.json({ id, filename, data, mimeType });
});

app.delete('/api/attachments/:id', async (req, res) => {
  const db = await getDb();
  db.run("DELETE FROM attachments WHERE id = ?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ─── COMMENTS ────────────────────────────────────────────
app.post('/api/articles/:articleId/comments', async (req, res) => {
  const db = await getDb();
  const c = req.body;
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

app.delete('/api/comments/:id', async (req, res) => {
  const db = await getDb();
  // Also delete child replies
  db.run("DELETE FROM comments WHERE parent_id = ?", [req.params.id]);
  db.run("DELETE FROM comments WHERE id = ?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ─── NOTIFICATIONS ───────────────────────────────────────
app.get('/api/notifications/:userId', async (req, res) => {
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

app.put('/api/notifications/:id/read', async (req, res) => {
  const db = await getDb();
  db.run("UPDATE notifications SET read = 1 WHERE id = ?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.post('/api/notifications/read-all', async (req, res) => {
  const db = await getDb();
  const { userId } = req.body;
  db.run("UPDATE notifications SET read = 1 WHERE user_id = ?", [userId]);
  saveDb();
  res.json({ success: true });
});

// ─── DIGEST PREFERENCES ─────────────────────────────────
app.get('/api/digest/:userId', async (req, res) => {
  const db = await getDb();
  const rows = db.exec("SELECT user_id, enabled, frequency FROM digest_preferences WHERE user_id = ?", [req.params.userId]);
  if (!rows.length || !rows[0].values.length) {
    return res.json({ userId: req.params.userId, enabled: false, frequency: 'weekly' });
  }
  const r = rows[0].values[0];
  res.json({ userId: r[0], enabled: !!(r[1] as number), frequency: r[2] });
});

app.put('/api/digest/:userId', async (req, res) => {
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
app.get('/api/section-editors', async (_req, res) => {
  const db = await getDb();
  const rows = db.exec("SELECT user_id, section_id FROM section_editors");
  if (!rows.length) return res.json([]);
  const editors = rows[0].values.map(r => ({
    userId: r[0] as string,
    sectionId: r[1] as string,
  }));
  res.json(editors);
});

app.post('/api/section-editors', async (req, res) => {
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

app.delete('/api/section-editors', async (req, res) => {
  const db = await getDb();
  const { userId, sectionId } = req.body;
  db.run("DELETE FROM section_editors WHERE user_id = ? AND section_id = ?", [userId, sectionId]);
  saveDb();
  res.json({ success: true });
});

// ─── EMAIL CONFIG ────────────────────────────────────────
app.get('/api/email-config', async (_req, res) => {
  const config = await getEmailConfig();
  if (!config) return res.json(null);
  // Mask the password in the response
  res.json({ ...config, password: config.password ? '••••••••' : '' });
});

app.put('/api/email-config', async (req, res) => {
  const db = await getDb();
  const c = req.body as EmailConfig;

  // If the password is the mask placeholder, keep the old password
  let password = c.password;
  if (password === '••••••••') {
    const existing = await getEmailConfig();
    password = existing?.password || '';
  }

  const existing = db.exec('SELECT id FROM email_config WHERE id = 1');
  if (existing.length && existing[0].values.length) {
    db.run(
      'UPDATE email_config SET provider=?, smtp_host=?, smtp_port=?, username=?, password=?, encryption=?, from_address=?, from_name=?, enabled=?, updated_at=? WHERE id=1',
      [c.provider, c.smtpHost, c.smtpPort, c.username, password, c.encryption, c.fromAddress, c.fromName, c.enabled ? 1 : 0, Date.now()]
    );
  } else {
    db.run(
      'INSERT INTO email_config (id, provider, smtp_host, smtp_port, username, password, encryption, from_address, from_name, enabled, updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?)',
      [c.provider, c.smtpHost, c.smtpPort, c.username, password, c.encryption, c.fromAddress, c.fromName, c.enabled ? 1 : 0, Date.now()]
    );
  }
  saveDb();
  res.json({ ...c, password: '••••••••' });
});

app.post('/api/email-config/test', async (req, res) => {
  const c = req.body as EmailConfig & { testEmailTo?: string };

  // If masked password, use stored password
  let password = c.password;
  if (password === '••••••••') {
    const existing = await getEmailConfig();
    password = existing?.password || '';
  }
  const configForTest: EmailConfig = { ...c, password };

  // First test the connection
  const connResult = await testConnection(configForTest);
  if (!connResult.success) {
    return res.json({ success: false, error: connResult.error });
  }

  // If a testEmailTo address is provided, send a test email
  if (c.testEmailTo) {
    const sendResult = await sendTestEmail(configForTest, c.testEmailTo);
    return res.json(sendResult);
  }

  res.json({ success: true });
});

// ─── START ───────────────────────────────────────────────
const PORT = 3001;

async function start() {
  await getDb();
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
