import { db } from '../db';
import { commentsTable, tasksTable, projectsTable, projectMembersTable, usersTable } from '../db/schema';
import { type CreateCommentInput, type GetCommentsInput, type Comment } from '../schema';
import { eq, and, desc } from 'drizzle-orm';

// Create a new comment on a task
export async function createComment(input: CreateCommentInput): Promise<Comment> {
  try {
    // Check if task exists and user has access to it via project membership
    const taskAccess = await db.select({
      task_id: tasksTable.id,
      project_id: projectsTable.id,
      has_access: projectMembersTable.id
    })
    .from(tasksTable)
    .innerJoin(projectsTable, eq(tasksTable.project_id, projectsTable.id))
    .innerJoin(projectMembersTable, and(
      eq(projectMembersTable.project_id, projectsTable.id),
      eq(projectMembersTable.user_id, input.author_id)
    ))
    .where(eq(tasksTable.id, input.task_id))
    .execute();

    if (taskAccess.length === 0) {
      throw new Error('Task not found or user does not have access to this project');
    }

    // Create new comment
    const result = await db.insert(commentsTable)
      .values({
        content: input.content,
        task_id: input.task_id,
        author_id: input.author_id
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Comment creation failed:', error);
    throw error;
  }
}

// Get all comments for a task
export async function getComments(input: GetCommentsInput): Promise<Comment[]> {
  try {
    // Fetch comments for the task, ordered by creation date
    const result = await db.select()
      .from(commentsTable)
      .where(eq(commentsTable.task_id, input.task_id))
      .orderBy(desc(commentsTable.created_at))
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    throw error;
  }
}

// Update a comment
export async function updateComment(id: number, content: string): Promise<Comment> {
  try {
    // Find and update the comment
    const result = await db.update(commentsTable)
      .set({
        content: content,
        updated_at: new Date()
      })
      .where(eq(commentsTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Comment not found');
    }

    return result[0];
  } catch (error) {
    console.error('Comment update failed:', error);
    throw error;
  }
}

// Delete a comment
export async function deleteComment(id: number): Promise<boolean> {
  try {
    const result = await db.delete(commentsTable)
      .where(eq(commentsTable.id, id))
      .returning({ id: commentsTable.id })
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('Comment deletion failed:', error);
    throw error;
  }
}

// Get comment by ID
export async function getCommentById(id: number): Promise<Comment | null> {
  try {
    const result = await db.select()
      .from(commentsTable)
      .where(eq(commentsTable.id, id))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to fetch comment:', error);
    throw error;
  }
}