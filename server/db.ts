import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'otsnews.db');

let db: Database;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing DB file or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL DEFAULT 'password',
      password_hash TEXT,
      password_algo TEXT,
      password_migrated_at INTEGER,
      must_reset_password INTEGER NOT NULL DEFAULT 0,
      auth_source TEXT NOT NULL DEFAULT 'local',
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER,
      role TEXT NOT NULL DEFAULT 'user',
      avatar TEXT
    );
  `);

  ensureColumn(db, 'users', 'password_hash', 'TEXT');
  ensureColumn(db, 'users', 'password_algo', 'TEXT');
  ensureColumn(db, 'users', 'password_migrated_at', 'INTEGER');
  ensureColumn(db, 'users', 'must_reset_password', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'auth_source', "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(db, 'users', 'failed_login_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'locked_until', 'INTEGER');
  ensureColumn(db, 'users', 'title', 'TEXT');
  ensureColumn(db, 'users', 'section', 'TEXT');

  db.run(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subsections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      section_id TEXT NOT NULL,
      FOREIGN KEY (section_id) REFERENCES sections(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      section_id TEXT NOT NULL,
      subsection_id TEXT,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      image_url TEXT,
      allow_comments INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'published',
      FOREIGN KEY (section_id) REFERENCES sections(id),
      FOREIGN KEY (author_id) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      article_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (article_id, tag),
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      data TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      parent_id TEXT,
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS section_editors (
      user_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      PRIMARY KEY (user_id, section_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (section_id) REFERENCES sections(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      article_id TEXT,
      timestamp INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS digest_preferences (
      user_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      frequency TEXT NOT NULL DEFAULT 'weekly',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS legis_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS legis_items (
      id TEXT PRIMARY KEY,
      bill_id TEXT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      source_type TEXT NOT NULL,
      status TEXT,
      excerpt TEXT,
      published_at INTEGER,
      fetched_at INTEGER NOT NULL,
      tags TEXT
    );
  `);

  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_legis_items_url ON legis_items(url)');

  db.run(`
    CREATE TABLE IF NOT EXISTS legis_runs (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL,
      error TEXT,
      items_added INTEGER NOT NULL DEFAULT 0
    );
  `);

  ensureColumn(db, 'legis_sources', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'legis_sources', 'created_at', 'INTEGER');
  ensureColumn(db, 'legis_sources', 'updated_at', 'INTEGER');
  ensureColumn(db, 'legis_items', 'bill_id', 'TEXT');
  ensureColumn(db, 'legis_items', 'status', 'TEXT');
  ensureColumn(db, 'legis_items', 'excerpt', 'TEXT');
  ensureColumn(db, 'legis_items', 'published_at', 'INTEGER');
  ensureColumn(db, 'legis_items', 'fetched_at', 'INTEGER');
  ensureColumn(db, 'legis_items', 'tags', 'TEXT');
  ensureColumn(db, 'legis_runs', 'finished_at', 'INTEGER');
  ensureColumn(db, 'legis_runs', 'error', 'TEXT');
  ensureColumn(db, 'legis_runs', 'items_added', 'INTEGER NOT NULL DEFAULT 0');

  db.run(`
    CREATE TABLE IF NOT EXISTS email_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT NOT NULL DEFAULT 'custom',
      smtp_host TEXT NOT NULL DEFAULT '',
      smtp_port INTEGER NOT NULL DEFAULT 587,
      username TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      encryption TEXT NOT NULL DEFAULT 'tls',
      from_address TEXT NOT NULL DEFAULT '',
      from_name TEXT NOT NULL DEFAULT 'OTS NEWS',
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS saml_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider_type TEXT NOT NULL DEFAULT 'saml',
      enabled INTEGER NOT NULL DEFAULT 0,
      metadata_mode TEXT NOT NULL DEFAULT 'url',
      metadata_url TEXT NOT NULL DEFAULT '',
      metadata_xml TEXT NOT NULL DEFAULT '',
      idp_entity_id TEXT NOT NULL DEFAULT '',
      entry_point TEXT NOT NULL DEFAULT '',
      idp_cert TEXT NOT NULL DEFAULT '',
      logout_url TEXT NOT NULL DEFAULT '',
      sp_entity_id TEXT NOT NULL DEFAULT '',
      acs_url TEXT NOT NULL DEFAULT '',
      name_id_format TEXT NOT NULL DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      email_attribute TEXT NOT NULL DEFAULT 'email',
      display_name_attribute TEXT NOT NULL DEFAULT 'name',
      updated_at INTEGER
    );
  `);

  // Seed data if tables are empty
  const userCount = db.exec("SELECT COUNT(*) as cnt FROM users")[0]?.values[0][0] as number;
  if (userCount === 0) {
    seedData(db);
  }

  seedLegisSources(db);

  saveDb();
  return db;
}

function seedData(db: Database) {
  // Seed users
  const users = [
    { id: 'u1', name: 'Alice Admin', email: 'alice.admin@la.gov', password: 'password', role: 'admin', avatar: 'https://picsum.photos/seed/alice/50/50' },
    { id: 'u2', name: 'Eddie Editor', email: 'eddie.editor@la.gov', password: 'password', role: 'editor', avatar: 'https://picsum.photos/seed/eddie/50/50' },
    { id: 'u3', name: 'John User', email: 'john.user@la.gov', password: 'password', role: 'user', avatar: 'https://picsum.photos/seed/john/50/50' },
    { id: 'u4', name: 'Guest Visitor', email: 'guest.visitor@la.gov', password: 'password', role: 'guest', avatar: 'https://picsum.photos/seed/guest/50/50' },
  ];
  for (const u of users) {
    db.run("INSERT INTO users (id, name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?, ?)", [u.id, u.name, u.email, u.password, u.role, u.avatar]);
  }

  // Seed sections
  const sections = [
    { id: 'euc', title: 'EUC' },
    { id: 'hr', title: 'Human Resources' },
    { id: 'general', title: 'General News' },
  ];
  for (const s of sections) {
    db.run("INSERT INTO sections (id, title) VALUES (?, ?)", [s.id, s.title]);
  }

  // Seed subsections
  const subsections = [
    { id: 'incident-management', title: 'Incident Management', section_id: 'euc' },
    { id: 'field-operations', title: 'Field Operations', section_id: 'euc' },
    { id: 'system-admin', title: 'System Admin', section_id: 'euc' },
    { id: 'asset-management', title: 'Asset Management', section_id: 'euc' },
    { id: 'benefits', title: 'Benefits', section_id: 'hr' },
    { id: 'careers', title: 'Careers', section_id: 'hr' },
  ];
  for (const ss of subsections) {
    db.run("INSERT INTO subsections (id, title, section_id) VALUES (?, ?, ?)", [ss.id, ss.title, ss.section_id]);
  }

  // Seed articles
  const now = Date.now();
  const articles = [
    {
      id: 'a1', title: 'ServiceNow Implementation Update',
      excerpt: 'Key updates regarding the new ServiceNow module for Incident Management.',
      content: `<h2>ServiceNow Migration Successful</h2><p>We are pleased to announce that the migration to the new ServiceNow instance for <strong>Incident Management</strong> has been completed successfully.</p><p>All users in the EUC department should now use the new portal for logging tickets.</p><h3>Key Changes:</h3><ul><li>New simplified UI for ticket creation.</li><li>Automated routing to Level 2 support.</li><li>Improved SLA tracking dashboard.</li></ul><p>Please refer to the training documentation for more details.</p>`,
      section_id: 'euc', subsection_id: 'incident-management',
      author_id: 'u1', author_name: 'Alice Admin',
      timestamp: now - 10000000,
      image_url: 'https://picsum.photos/seed/snow/800/400',
      allow_comments: 1, status: 'published',
      tags: ['servicenow', 'migration', 'incident-management'],
    },
    {
      id: 'a2', title: 'Annual Company Picnic',
      excerpt: 'Join us for food, fun, and games at the city park next Friday!',
      content: `<p>It's that time of year again! The annual company picnic is fast approaching.</p><p><strong>When:</strong> Friday, July 24th<br><strong>Where:</strong> Central City Park</p><p>Bring your families and enjoy a day of BBQ and team building activities.</p>`,
      section_id: 'general', subsection_id: null,
      author_id: 'u2', author_name: 'Eddie Editor',
      timestamp: now - 20000000,
      image_url: 'https://picsum.photos/seed/picnic/800/400',
      allow_comments: 1, status: 'published',
      tags: ['event', 'team-building'],
    },
    {
      id: 'a3', title: 'New Health Benefit Options',
      excerpt: 'Open enrollment begins next week. Review the new plans available.',
      content: `<p>We have added two new provider options for dental and vision.</p>`,
      section_id: 'hr', subsection_id: 'benefits',
      author_id: 'u1', author_name: 'Alice Admin',
      timestamp: now - 86400000,
      image_url: null, allow_comments: 0, status: 'published',
      tags: ['benefits', 'enrollment', 'hr'],
    },
    {
      id: 'a4', title: 'SWE Migration Project Kickoff',
      excerpt: 'The Software Engineering migration to the new VDI environment starts this month.',
      content: `<h2>SWE Migration Details</h2><p>The Field Operations team is preparing to migrate the Software Engineering (SWE) department to the new high-performance VDI environment.</p><p><strong>Timeline:</strong></p><ul><li>Pilot Group: June 15th</li><li>Wave 1: June 22nd</li><li>Wave 2: June 29th</li></ul><p>Please ensure all data is backed up to OneDrive prior to your scheduled migration slot.</p>`,
      section_id: 'euc', subsection_id: 'field-operations',
      author_id: 'u1', author_name: 'Alice Admin',
      timestamp: now - 500000,
      image_url: 'https://picsum.photos/seed/tech/800/400',
      allow_comments: 1, status: 'published',
      tags: ['migration', 'vdi', 'field-operations'],
    },
  ];
  for (const a of articles) {
    db.run(
      "INSERT INTO articles (id, title, content, excerpt, section_id, subsection_id, author_id, author_name, timestamp, image_url, allow_comments, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [a.id, a.title, a.content, a.excerpt, a.section_id, a.subsection_id, a.author_id, a.author_name, a.timestamp, a.image_url, a.allow_comments, a.status]
    );
    // Seed tags
    for (const tag of a.tags) {
      db.run("INSERT INTO tags (article_id, tag) VALUES (?, ?)", [a.id, tag]);
    }
  }

  // Seed one comment
  db.run(
    "INSERT INTO comments (id, article_id, author_id, author_name, author_avatar, content, timestamp, parent_id) VALUES (?,?,?,?,?,?,?,?)",
    ['c1', 'a1', 'u3', 'John User', 'https://picsum.photos/seed/john/50/50', 'This is great news! The new UI looks much cleaner.', now - 5000000, null]
  );

  // Seed section editors (Eddie is editor of EUC section)
  db.run(
    "INSERT INTO section_editors (user_id, section_id) VALUES (?, ?)",
    ['u2', 'euc']
  );

  // Seed a notification
  db.run(
    "INSERT INTO notifications (id, user_id, type, message, article_id, timestamp, read) VALUES (?,?,?,?,?,?,?)",
    ['n1', 'u3', 'new_article', 'Alice Admin published "SWE Migration Project Kickoff"', 'a4', now - 400000, 0]
  );
}

function seedLegisSources(db: Database) {
  const now = Date.now();
  const sources = [
    { id: 'legis-la-home', name: 'LA Legislature Home', url: 'https://legis.la.gov/', type: 'official', enabled: 1 },
    { id: 'legis-la-billinfo', name: 'LA Legislature Bill Info', url: 'https://legis.la.gov/legis/BillInfo.aspx', type: 'official', enabled: 1 },
    { id: 'legis-la-search', name: 'LA Legislature Bill Search', url: 'https://legis.la.gov/legis/BillSearchList.aspx', type: 'official', enabled: 1 },
    { id: 'la-illuminator', name: 'Louisiana Illuminator', url: 'https://lailluminator.com/feed/', type: 'news', enabled: 1 },
    { id: 'pelican-policy', name: 'Pelican Policy', url: 'https://pelicanpolicy.org/feed/', type: 'news', enabled: 1 },
    { id: 'legiscan-la', name: 'LegiScan Louisiana', url: 'https://legiscan.com/LA', type: 'news', enabled: 0 },
    { id: 'nola-com', name: 'NOLA.com Politics', url: 'https://www.nola.com/news/politics/', type: 'news', enabled: 0 },
    { id: 'reddit-louisiana', name: 'Reddit /r/Louisiana', url: 'https://www.reddit.com/r/louisiana/', type: 'forum', enabled: 0 },
    { id: 'reddit-neworleans', name: 'Reddit /r/NewOrleans', url: 'https://www.reddit.com/r/NewOrleans/', type: 'forum', enabled: 0 },
    // Bing News RSS proxies — tech/OTS-focused queries
    { id: 'bing-nola', name: 'NOLA.com Tech (via Bing)', url: 'https://www.bing.com/news/search?q=site%3Anola.com+louisiana+technology+OR+cybersecurity+OR+broadband+OR+%22office+of+technology%22&format=rss', type: 'news', enabled: 1 },
    { id: 'bing-advocate', name: 'Advocate Tech (via Bing)', url: 'https://www.bing.com/news/search?q=site%3Atheadvocate.com+louisiana+technology+OR+cybersecurity+OR+digital+OR+AI&format=rss', type: 'news', enabled: 1 },
    { id: 'bing-reddit', name: 'Reddit LA Tech (via Bing)', url: 'https://www.bing.com/news/search?q=site%3Areddit.com%2Fr%2Flouisiana+technology+OR+cybersecurity+OR+broadband+OR+%22state+IT%22&format=rss', type: 'forum', enabled: 1 },
    { id: 'bing-la-bills', name: 'LA Tech Bills (via Bing)', url: 'https://www.bing.com/news/search?q=louisiana+legislation+technology+OR+cybersecurity+OR+AI+OR+%22office+of+technology+services%22+OR+broadband&format=rss', type: 'news', enabled: 1 },
    { id: 'bing-la-ots', name: 'LA OTS News (via Bing)', url: 'https://www.bing.com/news/search?q=louisiana+%22office+of+technology+services%22+OR+%22OTS%22+OR+%22state+CIO%22+OR+%22digital+services%22&format=rss', type: 'news', enabled: 1 },
  ];

  const existingRows = db.exec('SELECT id FROM legis_sources');
  const existingIds = new Set((existingRows[0]?.values || []).map(row => row[0] as string));

  for (const source of sources) {
    if (existingIds.has(source.id)) {
      db.run('UPDATE legis_sources SET name = ?, url = ?, type = ?, enabled = ?, updated_at = ? WHERE id = ?', [
        source.name,
        source.url,
        source.type,
        source.enabled,
        now,
        source.id,
      ]);
      continue;
    }

    db.run(
      'INSERT INTO legis_sources (id, name, url, type, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [source.id, source.name, source.url, source.type, source.enabled, now, now]
    );
  }
}

function ensureColumn(db: Database, tableName: string, columnName: string, definition: string) {
  const info = db.exec(`PRAGMA table_info(${tableName})`);
  const columns = info[0]?.values || [];
  const exists = columns.some((row) => row[1] === columnName);
  if (!exists) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}
