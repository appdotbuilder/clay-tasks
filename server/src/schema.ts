import { z } from 'zod';

// Enums
export const userRoleEnum = z.enum(['admin', 'manager', 'member', 'viewer']);
export const taskPriorityEnum = z.enum(['low', 'medium', 'high']);
export const taskStatusEnum = z.enum(['todo', 'in_progress', 'review', 'done']);
export const authProviderEnum = z.enum(['email', 'google']);

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
  password_hash: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: userRoleEnum,
  organization_id: z.number(),
  auth_provider: authProviderEnum,
  google_id: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Organization schema
export const organizationSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Organization = z.infer<typeof organizationSchema>;

// Project schema
export const projectSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  deadline: z.coerce.date().nullable(),
  organization_id: z.number(),
  created_by: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Project = z.infer<typeof projectSchema>;

// Task schema
export const taskSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  project_id: z.number(),
  assignee_id: z.number().nullable(),
  priority: taskPriorityEnum,
  status: taskStatusEnum,
  due_date: z.coerce.date().nullable(),
  position: z.number().int(),
  created_by: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Task = z.infer<typeof taskSchema>;

// Project member schema
export const projectMemberSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  user_id: z.number(),
  role: userRoleEnum,
  created_at: z.coerce.date()
});

export type ProjectMember = z.infer<typeof projectMemberSchema>;

// Comment schema
export const commentSchema = z.object({
  id: z.number(),
  content: z.string(),
  task_id: z.number(),
  author_id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Comment = z.infer<typeof commentSchema>;

// Invitation schema
export const invitationSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  organization_id: z.number(),
  role: userRoleEnum,
  token: z.string(),
  expires_at: z.coerce.date(),
  accepted_at: z.coerce.date().nullable(),
  invited_by: z.number(),
  created_at: z.coerce.date()
});

export type Invitation = z.infer<typeof invitationSchema>;

// Input schemas for creating/updating entities

// Auth input schemas
export const registerInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  organization_name: z.string().min(1)
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const googleAuthInputSchema = z.object({
  google_id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatar_url: z.string().optional()
});

export type GoogleAuthInput = z.infer<typeof googleAuthInputSchema>;

// User input schemas
export const createUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: userRoleEnum,
  organization_id: z.number(),
  password: z.string().min(6).optional(),
  auth_provider: authProviderEnum.default('email')
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  role: userRoleEnum.optional(),
  avatar_url: z.string().nullable().optional(),
  is_active: z.boolean().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Organization input schemas
export const createOrganizationInputSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1)
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

// Project input schemas
export const createProjectInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
  organization_id: z.number(),
  created_by: z.number()
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  deadline: z.coerce.date().nullable().optional()
});

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

// Task input schemas
export const createTaskInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  project_id: z.number(),
  assignee_id: z.number().nullable().optional(),
  priority: taskPriorityEnum.default('medium'),
  status: taskStatusEnum.default('todo'),
  due_date: z.coerce.date().nullable().optional(),
  created_by: z.number()
});

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const updateTaskInputSchema = z.object({
  id: z.number(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assignee_id: z.number().nullable().optional(),
  priority: taskPriorityEnum.optional(),
  status: taskStatusEnum.optional(),
  due_date: z.coerce.date().nullable().optional(),
  position: z.number().int().optional()
});

export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const moveTaskInputSchema = z.object({
  id: z.number(),
  status: taskStatusEnum,
  position: z.number().int()
});

export type MoveTaskInput = z.infer<typeof moveTaskInputSchema>;

// Project member input schemas
export const addProjectMemberInputSchema = z.object({
  project_id: z.number(),
  user_id: z.number(),
  role: userRoleEnum
});

export type AddProjectMemberInput = z.infer<typeof addProjectMemberInputSchema>;

// Comment input schemas
export const createCommentInputSchema = z.object({
  content: z.string().min(1),
  task_id: z.number(),
  author_id: z.number()
});

export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;

// Invitation input schemas
export const createInvitationInputSchema = z.object({
  email: z.string().email(),
  organization_id: z.number(),
  role: userRoleEnum,
  invited_by: z.number()
});

export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;

export const acceptInvitationInputSchema = z.object({
  token: z.string(),
  name: z.string().min(1),
  password: z.string().min(6)
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;

// Query input schemas
export const getProjectsInputSchema = z.object({
  organization_id: z.number()
});

export type GetProjectsInput = z.infer<typeof getProjectsInputSchema>;

export const getTasksInputSchema = z.object({
  project_id: z.number()
});

export type GetTasksInput = z.infer<typeof getTasksInputSchema>;

export const getCommentsInputSchema = z.object({
  task_id: z.number()
});

export type GetCommentsInput = z.infer<typeof getCommentsInputSchema>;