import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { organizationsTable, usersTable, projectsTable, tasksTable, commentsTable, projectMembersTable } from '../db/schema';
import { type CreateCommentInput, type GetCommentsInput } from '../schema';
import { createComment, getComments, updateComment, deleteComment, getCommentById } from '../handlers/comments';
import { eq } from 'drizzle-orm';

// Test data
const testOrg = {
  name: 'Test Organization',
  slug: 'test-org'
};

const testUser = {
  email: 'test@example.com',
  name: 'Test User',
  password_hash: 'hashedpassword',
  role: 'member' as const,
  organization_id: 1,
  auth_provider: 'email' as const,
  is_active: true
};

const testUser2 = {
  email: 'test2@example.com',
  name: 'Test User 2',
  password_hash: 'hashedpassword',
  role: 'member' as const,
  organization_id: 1,
  auth_provider: 'email' as const,
  is_active: true
};

const testProject = {
  name: 'Test Project',
  description: 'A test project',
  organization_id: 1,
  created_by: 1
};

const testTask = {
  title: 'Test Task',
  description: 'A test task',
  project_id: 1,
  assignee_id: 1,
  priority: 'medium' as const,
  status: 'todo' as const,
  created_by: 1
};

const testComment: CreateCommentInput = {
  content: 'This is a test comment',
  task_id: 1,
  author_id: 1
};

describe('Comments Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createComment', () => {
    it('should create a comment successfully', async () => {
      // Create prerequisite data
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();
      await db.insert(projectMembersTable).values({
        project_id: 1,
        user_id: 1,
        role: 'member'
      }).execute();

      const result = await createComment(testComment);

      expect(result.content).toEqual('This is a test comment');
      expect(result.task_id).toEqual(1);
      expect(result.author_id).toEqual(1);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save comment to database', async () => {
      // Create prerequisite data
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();
      await db.insert(projectMembersTable).values({
        project_id: 1,
        user_id: 1,
        role: 'member'
      }).execute();

      const result = await createComment(testComment);

      const savedComments = await db.select()
        .from(commentsTable)
        .where(eq(commentsTable.id, result.id))
        .execute();

      expect(savedComments).toHaveLength(1);
      expect(savedComments[0].content).toEqual('This is a test comment');
      expect(savedComments[0].task_id).toEqual(1);
      expect(savedComments[0].author_id).toEqual(1);
    });

    it('should throw error when task does not exist', async () => {
      // Create prerequisite data without task
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(projectMembersTable).values({
        project_id: 1,
        user_id: 1,
        role: 'member'
      }).execute();

      expect(createComment({
        ...testComment,
        task_id: 999 // Non-existent task
      })).rejects.toThrow(/task not found or user does not have access/i);
    });

    it('should throw error when user is not a project member', async () => {
      // Create prerequisite data without project membership
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(usersTable).values(testUser2).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();
      await db.insert(projectMembersTable).values({
        project_id: 1,
        user_id: 1,
        role: 'member'
      }).execute();

      expect(createComment({
        ...testComment,
        author_id: 2 // User 2 is not a project member
      })).rejects.toThrow(/task not found or user does not have access/i);
    });
  });

  describe('getComments', () => {
    it('should return comments for a task', async () => {
      // Create prerequisite data
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();
      await db.insert(commentsTable).values({
        content: 'First comment',
        task_id: 1,
        author_id: 1
      }).execute();
      await db.insert(commentsTable).values({
        content: 'Second comment',
        task_id: 1,
        author_id: 1
      }).execute();

      const input: GetCommentsInput = { task_id: 1 };
      const result = await getComments(input);

      expect(result).toHaveLength(2);
      expect(result[0].content).toEqual('Second comment'); // Most recent first
      expect(result[1].content).toEqual('First comment');
      expect(result[0].task_id).toEqual(1);
      expect(result[0].author_id).toEqual(1);
    });

    it('should return empty array when task has no comments', async () => {
      const input: GetCommentsInput = { task_id: 999 };
      const result = await getComments(input);

      expect(result).toHaveLength(0);
    });

    it('should order comments by creation date descending', async () => {
      // Create prerequisite data
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();

      // Insert comments with slight delay to ensure different timestamps
      await db.insert(commentsTable).values({
        content: 'Oldest comment',
        task_id: 1,
        author_id: 1
      }).execute();

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      await db.insert(commentsTable).values({
        content: 'Newest comment',
        task_id: 1,
        author_id: 1
      }).execute();

      const input: GetCommentsInput = { task_id: 1 };
      const result = await getComments(input);

      expect(result).toHaveLength(2);
      expect(result[0].content).toEqual('Newest comment');
      expect(result[1].content).toEqual('Oldest comment');
      expect(result[0].created_at.getTime()).toBeGreaterThanOrEqual(result[1].created_at.getTime());
    });
  });

  describe('updateComment', () => {
    it('should update comment content', async () => {
      // Create prerequisite data
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();
      
      const commentResult = await db.insert(commentsTable).values({
        content: 'Original comment',
        task_id: 1,
        author_id: 1
      }).returning().execute();

      const result = await updateComment(commentResult[0].id, 'Updated comment content');

      expect(result.content).toEqual('Updated comment content');
      expect(result.id).toEqual(commentResult[0].id);
      expect(result.task_id).toEqual(1);
      expect(result.author_id).toEqual(1);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.updated_at.getTime()).toBeGreaterThan(result.created_at.getTime());
    });

    it('should throw error when comment does not exist', async () => {
      expect(updateComment(999, 'Updated content')).rejects.toThrow(/comment not found/i);
    });

    it('should update comment in database', async () => {
      // Create prerequisite data
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();
      
      const commentResult = await db.insert(commentsTable).values({
        content: 'Original comment',
        task_id: 1,
        author_id: 1
      }).returning().execute();

      await updateComment(commentResult[0].id, 'Updated comment content');

      const updatedComment = await db.select()
        .from(commentsTable)
        .where(eq(commentsTable.id, commentResult[0].id))
        .execute();

      expect(updatedComment[0].content).toEqual('Updated comment content');
    });
  });

  describe('deleteComment', () => {
    it('should delete comment successfully', async () => {
      // Create prerequisite data
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();
      
      const commentResult = await db.insert(commentsTable).values({
        content: 'Comment to delete',
        task_id: 1,
        author_id: 1
      }).returning().execute();

      const result = await deleteComment(commentResult[0].id);

      expect(result).toBe(true);
    });

    it('should return false when comment does not exist', async () => {
      const result = await deleteComment(999);

      expect(result).toBe(false);
    });

    it('should remove comment from database', async () => {
      // Create prerequisite data
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();
      
      const commentResult = await db.insert(commentsTable).values({
        content: 'Comment to delete',
        task_id: 1,
        author_id: 1
      }).returning().execute();

      await deleteComment(commentResult[0].id);

      const deletedComment = await db.select()
        .from(commentsTable)
        .where(eq(commentsTable.id, commentResult[0].id))
        .execute();

      expect(deletedComment).toHaveLength(0);
    });
  });

  describe('getCommentById', () => {
    it('should return comment when found', async () => {
      // Create prerequisite data
      await db.insert(organizationsTable).values(testOrg).execute();
      await db.insert(usersTable).values(testUser).execute();
      await db.insert(projectsTable).values(testProject).execute();
      await db.insert(tasksTable).values(testTask).execute();
      
      const commentResult = await db.insert(commentsTable).values({
        content: 'Test comment',
        task_id: 1,
        author_id: 1
      }).returning().execute();

      const result = await getCommentById(commentResult[0].id);

      expect(result).not.toBeNull();
      expect(result?.content).toEqual('Test comment');
      expect(result?.task_id).toEqual(1);
      expect(result?.author_id).toEqual(1);
      expect(result?.id).toEqual(commentResult[0].id);
    });

    it('should return null when comment not found', async () => {
      const result = await getCommentById(999);

      expect(result).toBeNull();
    });
  });
});