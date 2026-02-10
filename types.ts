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