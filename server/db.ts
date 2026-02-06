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
      role TEXT NOT NULL DEFAULT 'user',
      avatar TEXT
    );
  `);

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
      FOREIGN KEY (section_id) REFERENCES sections(id),
      FOREIGN KEY (author_id) REFERENCES users(id)
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
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );
  `);

  // Seed data if tables are empty
  const userCount = db.exec("SELECT COUNT(*) as cnt FROM users")[0]?.values[0][0] as number;
  if (userCount === 0) {
    seedData(db);
  }

  saveDb();
  return db;
}

function seedData(db: Database) {
  // Seed users
  const users = [
    { id: 'u1', name: 'Alice Admin', role: 'admin', avatar: 'https://picsum.photos/seed/alice/50/50' },
    { id: 'u2', name: 'Eddie Editor', role: 'editor', avatar: 'https://picsum.photos/seed/eddie/50/50' },
    { id: 'u3', name: 'John User', role: 'user', avatar: 'https://picsum.photos/seed/john/50/50' },
    { id: 'u4', name: 'Guest Visitor', role: 'guest', avatar: 'https://picsum.photos/seed/guest/50/50' },
  ];
  for (const u of users) {
    db.run("INSERT INTO users (id, name, role, avatar) VALUES (?, ?, ?, ?)", [u.id, u.name, u.role, u.avatar]);
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
      allow_comments: 1,
    },
    {
      id: 'a2', title: 'Annual Company Picnic',
      excerpt: 'Join us for food, fun, and games at the city park next Friday!',
      content: `<p>It's that time of year again! The annual company picnic is fast approaching.</p><p><strong>When:</strong> Friday, July 24th<br><strong>Where:</strong> Central City Park</p><p>Bring your families and enjoy a day of BBQ and team building activities.</p>`,
      section_id: 'general', subsection_id: null,
      author_id: 'u2', author_name: 'Eddie Editor',
      timestamp: now - 20000000,
      image_url: 'https://picsum.photos/seed/picnic/800/400',
      allow_comments: 1,
    },
    {
      id: 'a3', title: 'New Health Benefit Options',
      excerpt: 'Open enrollment begins next week. Review the new plans available.',
      content: `<p>We have added two new provider options for dental and vision.</p>`,
      section_id: 'hr', subsection_id: 'benefits',
      author_id: 'u1', author_name: 'Alice Admin',
      timestamp: now - 86400000,
      image_url: null, allow_comments: 0,
    },
    {
      id: 'a4', title: 'SWE Migration Project Kickoff',
      excerpt: 'The Software Engineering migration to the new VDI environment starts this month.',
      content: `<h2>SWE Migration Details</h2><p>The Field Operations team is preparing to migrate the Software Engineering (SWE) department to the new high-performance VDI environment.</p><p><strong>Timeline:</strong></p><ul><li>Pilot Group: June 15th</li><li>Wave 1: June 22nd</li><li>Wave 2: June 29th</li></ul><p>Please ensure all data is backed up to OneDrive prior to your scheduled migration slot.</p>`,
      section_id: 'euc', subsection_id: 'field-operations',
      author_id: 'u1', author_name: 'Alice Admin',
      timestamp: now - 500000,
      image_url: 'https://picsum.photos/seed/tech/800/400',
      allow_comments: 1,
    },
  ];
  for (const a of articles) {
    db.run(
      "INSERT INTO articles (id, title, content, excerpt, section_id, subsection_id, author_id, author_name, timestamp, image_url, allow_comments) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [a.id, a.title, a.content, a.excerpt, a.section_id, a.subsection_id, a.author_id, a.author_name, a.timestamp, a.image_url, a.allow_comments]
    );
  }

  // Seed one comment
  db.run(
    "INSERT INTO comments (id, article_id, author_id, author_name, author_avatar, content, timestamp) VALUES (?,?,?,?,?,?,?)",
    ['c1', 'a1', 'u3', 'John User', 'https://picsum.photos/seed/john/50/50', 'This is great news! The new UI looks much cleaner.', now - 5000000]
  );
}

export function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}
