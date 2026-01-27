import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { mockPosts } from '../lib/mock-data';

const DB_PATH = path.join(process.cwd(), 'data');
const POSTS_FILE = path.join(DB_PATH, 'posts.json');

async function initDatabase() {
  try {
    // Create data directory if it doesn't exist
    if (!existsSync(DB_PATH)) {
      await mkdir(DB_PATH, { recursive: true });
      console.log('Created data directory');
    }

    // Create posts file with mock data
    await writeFile(POSTS_FILE, JSON.stringify(mockPosts, null, 2));
    console.log('Database initialized with mock data!');
    console.log(`Created ${mockPosts.length} posts`);
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

initDatabase();
