import { getDb, saveDb } from './db';

async function seed() {
  const db = await getDb();
  const userRows = db.exec('SELECT COUNT(*) as cnt FROM users');
  const articleRows = db.exec('SELECT COUNT(*) as cnt FROM articles');

  const userCount = Number(userRows[0]?.values?.[0]?.[0] ?? 0);
  const articleCount = Number(articleRows[0]?.values?.[0]?.[0] ?? 0);

  saveDb();
  console.log(`✅ SQLite ready: users=${userCount}, articles=${articleCount}`);
}

seed().catch((err) => {
  console.error('❌ Failed to seed SQLite database:', err);
  process.exit(1);
});
