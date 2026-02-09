// Frontend API client – all calls go to /api/* which Vite proxies to Express
import { Article, Comment, Section, User, UserRole } from '../types';

const BASE = '/api';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ─── USERS ───────────────────────────────────────────────
export async function fetchUsers(): Promise<User[]> {
  return json<User[]>(`${BASE}/users`);
}

export async function loginUser(email: string, password: string): Promise<User> {
  return json<User>(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function createUser(user: User & { password?: string }): Promise<User> {
  return json<User>(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  await json<any>(`${BASE}/users/${userId}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await json<any>(`${BASE}/users/${userId}`, { method: 'DELETE' });
}

// ─── SECTIONS ────────────────────────────────────────────
export async function fetchSections(): Promise<Section[]> {
  return json<Section[]>(`${BASE}/sections`);
}

export async function createSection(id: string, title: string): Promise<Section> {
  return json<Section>(`${BASE}/sections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title }),
  });
}

export async function deleteSection(sectionId: string): Promise<void> {
  await json<any>(`${BASE}/sections/${sectionId}`, { method: 'DELETE' });
}

export async function createSubsection(sectionId: string, id: string, title: string): Promise<void> {
  await json<any>(`${BASE}/sections/${sectionId}/subsections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title }),
  });
}

// ─── ARTICLES ────────────────────────────────────────────
export async function fetchArticles(): Promise<Article[]> {
  return json<Article[]>(`${BASE}/articles`);
}

export async function createArticle(article: Article): Promise<Article> {
  return json<Article>(`${BASE}/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(article),
  });
}

export async function updateArticle(article: Article): Promise<Article> {
  return json<Article>(`${BASE}/articles/${article.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(article),
  });
}

// ─── COMMENTS ────────────────────────────────────────────
export async function postComment(articleId: string, comment: Comment): Promise<Comment> {
  return json<Comment>(`${BASE}/articles/${articleId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comment),
  });
}
