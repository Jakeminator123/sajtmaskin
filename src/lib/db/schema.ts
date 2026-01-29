import { pgTable, text, timestamp, varchar, jsonb, boolean } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  v0ProjectId: text('v0_project_id').notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chats = pgTable('chats', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  v0ChatId: text('v0_chat_id').notNull().unique(),
  v0ProjectId: text('v0_project_id').notNull(),
  webUrl: text('web_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const versions = pgTable('versions', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').references(() => chats.id).notNull(),
  v0VersionId: text('v0_version_id').notNull(),
  v0MessageId: text('v0_message_id'),
  demoUrl: text('demo_url'),
  metadata: jsonb('metadata'),
  pinned: boolean('pinned').default(false),
  pinnedAt: timestamp('pinned_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deployments = pgTable('deployments', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  chatId: text('chat_id').references(() => chats.id).notNull(),
  versionId: text('version_id').references(() => versions.id).notNull(),
  v0DeploymentId: text('v0_deployment_id'),
  vercelDeploymentId: text('vercel_deployment_id'),
  vercelProjectId: text('vercel_project_id'),
  inspectorUrl: text('inspector_url'),
  url: text('url'),
  status: varchar('status', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
