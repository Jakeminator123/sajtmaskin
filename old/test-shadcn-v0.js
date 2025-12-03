#!/usr/bin/env node
/**
 * Test script to explore v0 + shadcn integration
 * 
 * The command "npx shadcn@latest add <url>" can add v0-generated components
 * directly to a project. Let's explore how this works.
 */

const { execSync, spawn } = require('child_process');
const https = require('https');
const url = require('url');

// Example v0 template URL (the token will expire, but let's see the structure)
const V0_URL = "https://v0.app/chat/b/LAlgtKK4aRA?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..J1sQJAAtBgbbplco.hAI7GioMKiAw2AA4xmU1gcM0Xw1YDEhL9Y3oGCjOig6mefutwgE2eHuu.NSXfyBAfgGvtLAHT0s1Ang";

console.log("=== V0 + Shadcn Integration Test ===\n");

// Parse the URL
const parsed = new URL(V0_URL);
console.log("Host:", parsed.host);
console.log("Path:", parsed.pathname);
console.log("Chat ID:", parsed.pathname.split('/').pop());
console.log("Token:", parsed.searchParams.get('token')?.substring(0, 50) + "...");
console.log();

// The token is a JWE (JSON Web Encryption) - encrypted JWT
// Format: header.encryptedKey.iv.ciphertext.tag
const token = parsed.searchParams.get('token');
if (token) {
  const parts = token.split('.');
  console.log("Token parts:", parts.length);
  console.log("Token type: JWE (encrypted)");
  
  // Decode the header (it's base64url encoded, not encrypted)
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    console.log("Token header:", header);
  } catch (e) {
    console.log("Could not decode header");
  }
}

console.log("\n=== Testing shadcn add ===\n");
console.log("Command: npx shadcn@latest add \"" + V0_URL + "\"");
console.log("\nThis command would:");
console.log("1. Contact v0.app with the token");
console.log("2. Download the component code");
console.log("3. Add it to your project's components folder");
console.log("4. Install any required dependencies");

console.log("\n=== How we could use this ===\n");
console.log("Option 1: Generate shareable links from our v0 API calls");
console.log("  - After v0.chats.create(), we get a chatId");
console.log("  - We might be able to generate a token for that chat");
console.log("  - User can then 'export' using shadcn CLI");

console.log("\nOption 2: Use shadcn CLI programmatically");
console.log("  - Run: npx shadcn@latest add <url> --yes");
console.log("  - This would download files directly");

console.log("\n=== Let's try fetching the URL directly ===\n");

// Try to fetch the URL to see what it returns
https.get(V0_URL, (res) => {
  console.log("Status:", res.statusCode);
  console.log("Headers:", JSON.stringify(res.headers, null, 2));
  
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (data.length < 1000) {
      console.log("Response:", data);
    } else {
      console.log("Response length:", data.length);
      console.log("First 500 chars:", data.substring(0, 500));
    }
  });
}).on('error', (e) => {
  console.log("Error:", e.message);
});

