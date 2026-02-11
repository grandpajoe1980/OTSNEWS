// Frontend API client – all calls go to /api/* which Vite proxies to Express
import { Article, Attachment, Comment, DigestPreference, Notification, Section, SectionEditor, User, UserRole } from '../types';

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

export async function resetUserPassword(userId: string, password: string): Promise<void> {
  await json<any>(`${BASE}/users/${userId}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
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

export async function searchArticles(query: string): Promise<Article[]> {
  return json<Article[]>(`${BASE}/articles/search?q=${encodeURIComponent(query)}`);
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

export async function deleteArticle(id: string): Promise<void> {
  await json<any>(`${BASE}/articles/${id}`, { method: 'DELETE' });
}

// ─── TAGS ────────────────────────────────────────────────
export async function fetchTags(): Promise<string[]> {
  return json<string[]>(`${BASE}/tags`);
}

// ─── ATTACHMENTS ─────────────────────────────────────────
export async function addAttachment(articleId: string, attachment: Attachment): Promise<Attachment> {
  return json<Attachment>(`${BASE}/articles/${articleId}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attachment),
  });
}

export async function deleteAttachment(id: string): Promise<void> {
  await json<any>(`${BASE}/attachments/${id}`, { method: 'DELETE' });
}

// ─── COMMENTS ────────────────────────────────────────────
export async function postComment(articleId: string, comment: Comment): Promise<Comment> {
  return json<Comment>(`${BASE}/articles/${articleId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comment),
  });
}

export async function deleteComment(id: string): Promise<void> {
  await json<any>(`${BASE}/comments/${id}`, { method: 'DELETE' });
}

// ─── NOTIFICATIONS ───────────────────────────────────────
export async function fetchNotifications(userId: string): Promise<Notification[]> {
  return json<Notification[]>(`${BASE}/notifications/${userId}`);
}

export async function markNotificationRead(id: string): Promise<void> {
  await json<any>(`${BASE}/notifications/${id}/read`, { method: 'PUT' });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await json<any>(`${BASE}/notifications/read-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}

// ─── DIGEST PREFERENCES ─────────────────────────────────
export async function fetchDigestPreference(userId: string): Promise<DigestPreference> {
  return json<DigestPreference>(`${BASE}/digest/${userId}`);
}

export async function updateDigestPreference(userId: string, pref: { enabled: boolean; frequency: string }): Promise<DigestPreference> {
  return json<DigestPreference>(`${BASE}/digest/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pref),
  });
}

// ─── SECTION EDITORS ─────────────────────────────────────
export async function fetchSectionEditors(): Promise<SectionEditor[]> {
  return json<SectionEditor[]>(`${BASE}/section-editors`);
}

export async function addSectionEditor(userId: string, sectionId: string): Promise<SectionEditor> {
  return json<SectionEditor>(`${BASE}/section-editors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, sectionId }),
  });
}

export async function removeSectionEditor(userId: string, sectionId: string): Promise<void> {
  await json<any>(`${BASE}/section-editors`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, sectionId }),
  });
}
