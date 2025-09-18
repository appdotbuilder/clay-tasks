import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import all input schemas
import {
  registerInputSchema,
  loginInputSchema,
  googleAuthInputSchema,
  createUserInputSchema,
  updateUserInputSchema,
  createOrganizationInputSchema,
  createProjectInputSchema,
  updateProjectInputSchema,
  getProjectsInputSchema,
  createTaskInputSchema,
  updateTaskInputSchema,
  moveTaskInputSchema,
  getTasksInputSchema,
  addProjectMemberInputSchema,
  createCommentInputSchema,
  getCommentsInputSchema,
  createInvitationInputSchema,
  acceptInvitationInputSchema
} from './schema';

// Import all handlers
import { register, login, googleAuth, verifyToken } from './handlers/auth';
import { createUser, getUsersByOrganization, getUserById, updateUser, deactivateUser } from './handlers/users';
import { createOrganization, getOrganizationById, getOrganizationBySlug, updateOrganization } from './handlers/organizations';
import { createProject, getProjects, getProjectById, updateProject, deleteProject } from './handlers/projects';
import { createTask, getTasks, getTaskById, updateTask, moveTask, deleteTask, getTasksByAssignee } from './handlers/tasks';
import { addProjectMember, getProjectMembers, updateProjectMemberRole, removeProjectMember, isProjectMember, getUserProjectRole } from './handlers/project_members';
import { createComment, getComments, updateComment, deleteComment, getCommentById } from './handlers/comments';
import { createInvitation, acceptInvitation, getInvitationByToken, getPendingInvitations, revokeInvitation, resendInvitation } from './handlers/invitations';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

// Main application router
const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    register: publicProcedure
      .input(registerInputSchema)
      .mutation(({ input }) => register(input)),
    
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    
    googleAuth: publicProcedure
      .input(googleAuthInputSchema)
      .mutation(({ input }) => googleAuth(input)),
    
    verifyToken: publicProcedure
      .input(z.string())
      .query(({ input }) => verifyToken(input)),
  }),

  // User management routes
  users: router({
    create: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
    
    getByOrganization: publicProcedure
      .input(z.number())
      .query(({ input }) => getUsersByOrganization(input)),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getUserById(input)),
    
    update: publicProcedure
      .input(updateUserInputSchema)
      .mutation(({ input }) => updateUser(input)),
    
    deactivate: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deactivateUser(input)),
  }),

  // Organization management routes
  organizations: router({
    create: publicProcedure
      .input(createOrganizationInputSchema)
      .mutation(({ input }) => createOrganization(input)),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getOrganizationById(input)),
    
    getBySlug: publicProcedure
      .input(z.string())
      .query(({ input }) => getOrganizationBySlug(input)),
    
    update: publicProcedure
      .input(z.object({ id: z.number(), name: z.string() }))
      .mutation(({ input }) => updateOrganization(input.id, input.name)),
  }),

  // Project management routes
  projects: router({
    create: publicProcedure
      .input(createProjectInputSchema)
      .mutation(({ input }) => createProject(input)),
    
    getAll: publicProcedure
      .input(getProjectsInputSchema)
      .query(({ input }) => getProjects(input)),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getProjectById(input)),
    
    update: publicProcedure
      .input(updateProjectInputSchema)
      .mutation(({ input }) => updateProject(input)),
    
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteProject(input)),
  }),

  // Task management routes
  tasks: router({
    create: publicProcedure
      .input(createTaskInputSchema)
      .mutation(({ input }) => createTask(input)),
    
    getAll: publicProcedure
      .input(getTasksInputSchema)
      .query(({ input }) => getTasks(input)),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getTaskById(input)),
    
    update: publicProcedure
      .input(updateTaskInputSchema)
      .mutation(({ input }) => updateTask(input)),
    
    move: publicProcedure
      .input(moveTaskInputSchema)
      .mutation(({ input }) => moveTask(input)),
    
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteTask(input)),
    
    getByAssignee: publicProcedure
      .input(z.number())
      .query(({ input }) => getTasksByAssignee(input)),
  }),

  // Project member management routes
  projectMembers: router({
    add: publicProcedure
      .input(addProjectMemberInputSchema)
      .mutation(({ input }) => addProjectMember(input)),
    
    getAll: publicProcedure
      .input(z.number())
      .query(({ input }) => getProjectMembers(input)),
    
    updateRole: publicProcedure
      .input(z.object({ 
        projectId: z.number(), 
        userId: z.number(), 
        role: z.enum(['admin', 'manager', 'member', 'viewer']) 
      }))
      .mutation(({ input }) => updateProjectMemberRole(input.projectId, input.userId, input.role)),
    
    remove: publicProcedure
      .input(z.object({ projectId: z.number(), userId: z.number() }))
      .mutation(({ input }) => removeProjectMember(input.projectId, input.userId)),
    
    isMember: publicProcedure
      .input(z.object({ projectId: z.number(), userId: z.number() }))
      .query(({ input }) => isProjectMember(input.projectId, input.userId)),
    
    getRole: publicProcedure
      .input(z.object({ projectId: z.number(), userId: z.number() }))
      .query(({ input }) => getUserProjectRole(input.projectId, input.userId)),
  }),

  // Comment management routes
  comments: router({
    create: publicProcedure
      .input(createCommentInputSchema)
      .mutation(({ input }) => createComment(input)),
    
    getAll: publicProcedure
      .input(getCommentsInputSchema)
      .query(({ input }) => getComments(input)),
    
    update: publicProcedure
      .input(z.object({ id: z.number(), content: z.string() }))
      .mutation(({ input }) => updateComment(input.id, input.content)),
    
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteComment(input)),
    
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getCommentById(input)),
  }),

  // Invitation management routes
  invitations: router({
    create: publicProcedure
      .input(createInvitationInputSchema)
      .mutation(({ input }) => createInvitation(input)),
    
    accept: publicProcedure
      .input(acceptInvitationInputSchema)
      .mutation(({ input }) => acceptInvitation(input)),
    
    getByToken: publicProcedure
      .input(z.string())
      .query(({ input }) => getInvitationByToken(input)),
    
    getPending: publicProcedure
      .input(z.number())
      .query(({ input }) => getPendingInvitations(input)),
    
    revoke: publicProcedure
      .input(z.number())
      .mutation(({ input }) => revokeInvitation(input)),
    
    resend: publicProcedure
      .input(z.number())
      .mutation(({ input }) => resendInvitation(input)),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors({
        origin: process.env['CLIENT_URL'] || 'http://localhost:3000',
        credentials: true,
      })(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  
  server.listen(port);
  console.log(`🚀 tRPC server listening at port: ${port}`);
  console.log(`📊 Database URL: ${process.env['APP_DATABASE_URL'] ? '✅ Connected' : '❌ Not configured'}`);
}

start().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});