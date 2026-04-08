export enum UserRole {
  GUEST = 'guest',
  USER = 'user',
  EDITOR = 'editor',
  ADMIN = 'admin',
}

export type Theme = 'light' | 'dark' | 'princess';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  avatar: string;
  title?: string;
  section?: string;
  authSource?: 'local' | 'saml';
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  timestamp: number;
  parentId?: string; // for threaded replies
}

export interface Attachment {
  id: string;
  filename: string;
  data: string; // base64
  mimeType: string;
}

export interface Article {
  id: string;
  title: string;
  content: string; // HTML string
  excerpt: string;
  sectionId: string;
  subsectionId?: string;
  authorId: string;
  authorName: string;
  timestamp: number;
  imageUrl?: string;
  allowComments: boolean;
  comments: Comment[];
  status: 'draft' | 'published';
  tags: string[];
  attachments: Attachment[];
}

export interface Section {
  id: string;
  title: string;
  subsections?: Section[];
}

export interface SectionEditor {
  userId: string;
  sectionId: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'new_article' | 'comment_reply' | 'comment_on_article';
  message: string;
  articleId?: string;
  timestamp: number;
  read: boolean;
}

export interface DigestPreference {
  userId: string;
  enabled: boolean;
  frequency: 'daily' | 'weekly';
}

export type EmailProvider = 'exchange' | 'google' | 'custom';

export interface EmailConfig {
  provider: EmailProvider;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  encryption: 'tls' | 'ssl' | 'none';
  fromAddress: string;
  fromName: string;
  enabled: boolean;
}

export type SamlProviderType = 'saml' | 'adfs' | 'active-directory';
export type SamlMetadataMode = 'url' | 'xml';

export interface SamlConfig {
  providerType: SamlProviderType;
  enabled: boolean;
  metadataMode: SamlMetadataMode;
  metadataUrl: string;
  metadataXml: string;
  idpEntityId: string;
  entryPoint: string;
  idpCert: string;
  logoutUrl: string;
  spEntityId: string;
  acsUrl: string;
  nameIdFormat: string;
  emailAttribute: string;
  displayNameAttribute: string;
}

export interface SamlPublicConfig {
  enabled: boolean;
  metadataUrl: string;
  spEntityId: string;
  acsUrl: string;
}

export interface SamlConfigTestResult {
  success: boolean;
  error?: string;
  parsed?: {
    idpEntityId: string;
    entryPoint: string;
    idpCert: string;
    logoutUrl: string;
  };
}

export type LegisSourceType = 'official' | 'news' | 'forum' | 'other';

export interface LegisItem {
  id: string;
  billId?: string;
  title: string;
  url: string;
  source: string;
  sourceType: LegisSourceType;
  status?: string;
  excerpt?: string;
  publishedAt?: number;
  fetchedAt: number;
  tags: string[];
}

export interface LegisRun {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: 'running' | 'success' | 'failed';
  error?: string;
  itemsAdded: number;
}

export interface LegisDigest {
  items: LegisItem[];
  lastRun: LegisRun | null;
}