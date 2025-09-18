import { serial, text, pgTable, timestamp, integer, boolean, pgEnum, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'manager', 'member', 'viewer']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high']);
export const taskStatusEnum = pgEnum('task_status', ['todo', 'in_progress', 'review', 'done']);
export const authProviderEnum = pgEnum('auth_provider', ['email', 'google']);

// Organizations table
export const organizationsTable = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  password_hash: text('password_hash'), // Nullable for OAuth users
  avatar_url: text('avatar_url'), // Nullable
  role: userRoleEnum('role').notNull().default('member'),
  organization_id: integer('organization_id').notNull().references(() => organizationsTable.id),
  auth_provider: authProviderEnum('auth_provider').notNull().default('email'),
  google_id: text('google_id'), // Nullable, unique for Google OAuth users
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  googleIdUnique: unique().on(table.google_id),
}));

// Projects table
export const projectsTable = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'), // Nullable
  deadline: timestamp('deadline'), // Nullable
  organization_id: integer('organization_id').notNull().references(() => organizationsTable.id),
  created_by: integer('created_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Tasks table
export const tasksTable = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'), // Nullable
  project_id: integer('project_id').notNull().references(() => projectsTable.id),
  assignee_id: integer('assignee_id').references(() => usersTable.id), // Nullable
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  status: taskStatusEnum('status').notNull().default('todo'),
  due_date: timestamp('due_date'), // Nullable
  position: integer('position').notNull().default(0), // For ordering within status columns
  created_by: integer('created_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Project members table (many-to-many relationship between users and projects)
export const projectMembersTable = pgTable('project_members', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id').notNull().references(() => projectsTable.id),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  role: userRoleEnum('role').notNull().default('member'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectUserUnique: unique().on(table.project_id, table.user_id),
}));

// Comments table
export const commentsTable = pgTable('comments', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  task_id: integer('task_id').notNull().references(() => tasksTable.id),
  author_id: integer('author_id').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Invitations table
export const invitationsTable = pgTable('invitations', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  organization_id: integer('organization_id').notNull().references(() => organizationsTable.id),
  role: userRoleEnum('role').notNull().default('member'),
  token: text('token').notNull().unique(),
  expires_at: timestamp('expires_at').notNull(),
  accepted_at: timestamp('accepted_at'), // Nullable
  invited_by: integer('invited_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const organizationsRelations = relations(organizationsTable, ({ many }) => ({
  users: many(usersTable),
  projects: many(projectsTable),
  invitations: many(invitationsTable),
}));

export const usersRelations = relations(usersTable, ({ one, many }) => ({
  organization: one(organizationsTable, {
    fields: [usersTable.organization_id],
    references: [organizationsTable.id],
  }),
  createdProjects: many(projectsTable, { relationName: 'creator' }),
  assignedTasks: many(tasksTable, { relationName: 'assignee' }),
  createdTasks: many(tasksTable, { relationName: 'creator' }),
  projectMemberships: many(projectMembersTable),
  comments: many(commentsTable),
  sentInvitations: many(invitationsTable),
}));

export const projectsRelations = relations(projectsTable, ({ one, many }) => ({
  organization: one(organizationsTable, {
    fields: [projectsTable.organization_id],
    references: [organizationsTable.id],
  }),
  creator: one(usersTable, {
    fields: [projectsTable.created_by],
    references: [usersTable.id],
    relationName: 'creator',
  }),
  tasks: many(tasksTable),
  members: many(projectMembersTable),
}));

export const tasksRelations = relations(tasksTable, ({ one, many }) => ({
  project: one(projectsTable, {
    fields: [tasksTable.project_id],
    references: [projectsTable.id],
  }),
  assignee: one(usersTable, {
    fields: [tasksTable.assignee_id],
    references: [usersTable.id],
    relationName: 'assignee',
  }),
  creator: one(usersTable, {
    fields: [tasksTable.created_by],
    references: [usersTable.id],
    relationName: 'creator',
  }),
  comments: many(commentsTable),
}));

export const projectMembersRelations = relations(projectMembersTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [projectMembersTable.project_id],
    references: [projectsTable.id],
  }),
  user: one(usersTable, {
    fields: [projectMembersTable.user_id],
    references: [usersTable.id],
  }),
}));

export const commentsRelations = relations(commentsTable, ({ one }) => ({
  task: one(tasksTable, {
    fields: [commentsTable.task_id],
    references: [tasksTable.id],
  }),
  author: one(usersTable, {
    fields: [commentsTable.author_id],
    references: [usersTable.id],
  }),
}));

export const invitationsRelations = relations(invitationsTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [invitationsTable.organization_id],
    references: [organizationsTable.id],
  }),
  inviter: one(usersTable, {
    fields: [invitationsTable.invited_by],
    references: [usersTable.id],
  }),
}));

// TypeScript types for the table schemas
export type Organization = typeof organizationsTable.$inferSelect;
export type NewOrganization = typeof organizationsTable.$inferInsert;

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Project = typeof projectsTable.$inferSelect;
export type NewProject = typeof projectsTable.$inferInsert;

export type Task = typeof tasksTable.$inferSelect;
export type NewTask = typeof tasksTable.$inferInsert;

export type ProjectMember = typeof projectMembersTable.$inferSelect;
export type NewProjectMember = typeof projectMembersTable.$inferInsert;

export type Comment = typeof commentsTable.$inferSelect;
export type NewComment = typeof commentsTable.$inferInsert;

export type Invitation = typeof invitationsTable.$inferSelect;
export type NewInvitation = typeof invitationsTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  organizations: organizationsTable,
  users: usersTable,
  projects: projectsTable,
  tasks: tasksTable,
  projectMembers: projectMembersTable,
  comments: commentsTable,
  invitations: invitationsTable,
};