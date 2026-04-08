// Frontend API client – all calls go to /api/* which Vite proxies to Express
import { Article, Attachment, Comment, DigestPreference, LegisDigest, Notification, SamlConfig, SamlConfigTestResult, SamlPublicConfig, Section, SectionEditor, User, UserRole } from '../types';

const BASE = '/api';

let csrfTokenCache: string | null = null;

function isStateChangingMethod(method?: string): boolean {
  const normalized = (method || 'GET').toUpperCase();
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE';
}

async function getCsrfToken(): Promise<string> {
  if (csrfTokenCache) return csrfTokenCache;
  const res = await fetch(`${BASE}/csrf-token`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  const data = await res.json() as { csrfToken?: string };
  if (!data.csrfToken) {
    throw new Error('Missing CSRF token');
  }
  csrfTokenCache = data.csrfToken;
  return csrfTokenCache;
}

function clearCsrfTokenCache() {
  csrfTokenCache = null;
}

async function json<T>(url: string, init?: RequestInit, allowCsrfRetry = true): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (isStateChangingMethod(init?.method)) {
    const csrfToken = await getCsrfToken();
    headers.set('x-csrf-token', csrfToken);
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers,
  });

  if (res.status === 403 && isStateChangingMethod(init?.method)) {
    let errorMessage = '';
    try {
      const errorBody = await res.clone().json() as { error?: string };
      errorMessage = String(errorBody?.error || '');
    } catch {
      // keep empty message
    }

    const isCsrfFailure = /csrf/i.test(errorMessage);
    clearCsrfTokenCache();
    if (isCsrfFailure && allowCsrfRetry) {
      return json<T>(url, init, false);
    }
  }
  if (!res.ok) {
    let message = `API ${res.status}: ${res.statusText}`;
    try {
      const errorBody = await res.json() as { error?: string };
      if (errorBody?.error) {
        message = errorBody.error;
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
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

export async function fetchSessionUser(): Promise<User> {
  return json<User>(`${BASE}/session`, { cache: 'no-store' });
}

export async function logoutUser(): Promise<void> {
  await json<any>(`${BASE}/logout`, { method: 'POST' });
  clearCsrfTokenCache();
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

export async function updateUserProfile(userId: string, payload: { name?: string; email?: string; avatar?: string; title?: string; section?: string }): Promise<User> {
  return json<User>(`${BASE}/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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

// ─── LEGIS TRACKER ─────────────────────────────────────
export async function fetchLegisDigest(): Promise<LegisDigest> {
  return json<LegisDigest>(`${BASE}/legis`);
}

export async function runLegisIngest(): Promise<{ runId: string; status: string; itemsAdded: number; trigger: string; error?: string }> {
  return json<{ runId: string; status: string; itemsAdded: number; trigger: string; error?: string }>(`${BASE}/legis/refresh`, {
    method: 'POST',
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

// ─── EMAIL CONFIG ────────────────────────────────────────
export async function fetchEmailConfig(): Promise<any> {
  return json<any>(`${BASE}/email-config`);
}

export async function saveEmailConfig(config: any): Promise<any> {
  return json<any>(`${BASE}/email-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function testEmailConfig(config: any): Promise<{ success: boolean; error?: string }> {
  return json<{ success: boolean; error?: string }>(`${BASE}/email-config/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

// ─── SAML CONFIG ────────────────────────────────────────
export async function fetchSamlConfig(): Promise<SamlConfig | null> {
  return json<SamlConfig | null>(`${BASE}/saml-config`);
}

export async function saveSamlConfig(config: SamlConfig): Promise<SamlConfig> {
  return json<SamlConfig>(`${BASE}/saml-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function testSamlConfig(config: Pick<SamlConfig, 'metadataMode' | 'metadataUrl' | 'metadataXml'>): Promise<SamlConfigTestResult> {
  return json<SamlConfigTestResult>(`${BASE}/saml-config/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function fetchSamlPublicConfig(): Promise<SamlPublicConfig> {
  return json<SamlPublicConfig>(`${BASE}/saml-config/public`, { cache: 'no-store' });
}

export function getSamlLoginUrl(): string {
  return `${BASE}/auth/saml/login`;
}

export function getSamlMetadataUrl(): string {
  return `${window.location.origin}${BASE}/auth/saml/metadata`;
}

