// Simple file-based database using JSON
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export type Author = 'zelda' | 'blanka';

export interface Post {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  author: Author;
  imageUrl?: string;
  tags: string[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

const DB_PATH = path.join(process.cwd(), 'data');
const POSTS_FILE = path.join(DB_PATH, 'posts.json');

// Initialize database
async function initDb() {
  if (!existsSync(DB_PATH)) {
    await mkdir(DB_PATH, { recursive: true });
  }
  if (!existsSync(POSTS_FILE)) {
    await writeFile(POSTS_FILE, JSON.stringify([]));
  }
}

// Read all posts
export async function getAllPosts(): Promise<Post[]> {
  await initDb();
  const data = await readFile(POSTS_FILE, 'utf-8');
  return JSON.parse(data);
}

// Get posts by author
export async function getPostsByAuthor(author: Author): Promise<Post[]> {
  const posts = await getAllPosts();
  return posts.filter(post => post.author === author && post.published)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Get single post by slug and author
export async function getPostBySlug(author: Author, slug: string): Promise<Post | null> {
  const posts = await getAllPosts();
  return posts.find(post => post.author === author && post.slug === slug && post.published) || null;
}

// Get recent posts from all authors
export async function getRecentPosts(limit = 6): Promise<Post[]> {
  const posts = await getAllPosts();
  return posts
    .filter(post => post.published)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

// Create post
export async function createPost(postData: Omit<Post, 'id' | 'createdAt' | 'updatedAt'>): Promise<Post> {
  await initDb();
  const posts = await getAllPosts();
  const newPost: Post = {
    ...postData,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  posts.push(newPost);
  await writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
  return newPost;
}

// Update post
export async function updatePost(id: string, updates: Partial<Post>): Promise<Post | null> {
  await initDb();
  const posts = await getAllPosts();
  const index = posts.findIndex(post => post.id === id);
  if (index === -1) return null;
  
  posts[index] = {
    ...posts[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
  return posts[index];
}

// Delete post
export async function deletePost(id: string): Promise<boolean> {
  await initDb();
  const posts = await getAllPosts();
  const filtered = posts.filter(post => post.id !== id);
  if (filtered.length === posts.length) return false;
  await writeFile(POSTS_FILE, JSON.stringify(filtered, null, 2));
  return true;
}
