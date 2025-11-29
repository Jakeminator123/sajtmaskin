/**
 * V0 API Test using Official AI SDK
 * Run: node test_v0_sdk.mjs
 */

import { generateText } from 'ai';
import { createVercel } from '@ai-sdk/vercel';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get API key
function getApiKey() {
  const locations = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '.env.local'),
    path.join(__dirname, 'app', '.env.local'),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      const content = fs.readFileSync(loc, 'utf-8');
      const match = content.match(/^V0_API_KEY\s*=\s*(.+)/m);
      if (match) {
        return match[1].trim().replace(/["']/g, '').replace(/\r/g, '');
      }
    }
  }
  return process.env.V0_API_KEY || null;
}

const apiKey = getApiKey();

if (!apiKey) {
  console.log('❌ No API key found!');
  process.exit(1);
}

console.log('✅ API key found:', apiKey.substring(0, 12) + '...');
console.log('');

// Create Vercel provider with API key
const vercel = createVercel({
  apiKey: apiKey,
});

// Test both models
const models = [
  { id: 'v0-1.5-md', name: 'Medium' },
  { id: 'v0-1.5-lg', name: 'Large (Premium)' },
];

for (const model of models) {
  console.log(`Testing: ${model.name} (${model.id})`);
  console.log('-'.repeat(50));
  
  try {
    const startTime = Date.now();
    
    const { text } = await generateText({
      model: vercel(model.id),
      prompt: 'Create a simple blue button in React with Tailwind. Just the component, minimal.',
      maxTokens: 200,
    });
    
    const elapsed = Date.now() - startTime;
    
    console.log(`✅ SUCCESS! (${elapsed}ms)`);
    console.log('Preview:');
    console.log(text.substring(0, 300));
    console.log('...');
  } catch (error) {
    console.log(`❌ FAILED!`);
    console.log('Error:', error.message);
  }
  
  console.log('');
}

console.log('Done!');

