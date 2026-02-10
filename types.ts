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