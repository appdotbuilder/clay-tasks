import { db } from '../db';
import { tasksTable, projectsTable, usersTable } from '../db/schema';
import { type CreateTaskInput, type UpdateTaskInput, type MoveTaskInput, type GetTasksInput, type Task } from '../schema';
import { eq, and, max, gte, desc, asc, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

// Create a new task
export async function createTask(input: CreateTaskInput): Promise<Task> {
  try {
    // Verify that project exists
    const project = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, input.project_id))
      .limit(1)
      .execute();

    if (project.length === 0) {
      throw new Error('Project not found');
    }

    // Verify that created_by user exists
    const creator = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.created_by))
      .limit(1)
      .execute();

    if (creator.length === 0) {
      throw new Error('Creator user not found');
    }

    // Verify assignee exists if provided
    if (input.assignee_id) {
      const assignee = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, input.assignee_id))
        .limit(1)
        .execute();

      if (assignee.length === 0) {
        throw new Error('Assignee user not found');
      }
    }

    // Get the next position for the status column
    const maxPositionResult = await db.select({
      maxPosition: max(tasksTable.position)
    })
      .from(tasksTable)
      .where(and(
        eq(tasksTable.project_id, input.project_id),
        eq(tasksTable.status, input.status)
      ))
      .execute();

    const nextPosition = (maxPositionResult[0]?.maxPosition ?? -1) + 1;

    // Create the task
    const result = await db.insert(tasksTable)
      .values({
        title: input.title,
        description: input.description || null,
        project_id: input.project_id,
        assignee_id: input.assignee_id || null,
        priority: input.priority,
        status: input.status,
        due_date: input.due_date || null,
        position: nextPosition,
        created_by: input.created_by
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Task creation failed:', error);
    throw error;
  }
}

// Get all tasks for a project
export async function getTasks(input: GetTasksInput): Promise<Task[]> {
  try {
    // Verify project exists
    const project = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, input.project_id))
      .limit(1)
      .execute();

    if (project.length === 0) {
      throw new Error('Project not found');
    }

    // Fetch all tasks for the project, ordered for Kanban board
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.project_id, input.project_id))
      .orderBy(
        asc(tasksTable.status),
        asc(tasksTable.position)
      )
      .execute();

    return tasks;
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    throw error;
  }
}

// Get a specific task by ID
export async function getTaskById(id: number): Promise<Task | null> {
  try {
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.id, id))
      .limit(1)
      .execute();

    return tasks.length > 0 ? tasks[0] : null;
  } catch (error) {
    console.error('Failed to fetch task:', error);
    throw error;
  }
}

// Update task information
export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  try {
    // First verify the task exists
    const existingTask = await getTaskById(input.id);
    if (!existingTask) {
      throw new Error('Task not found');
    }

    // Verify assignee exists if being updated
    if (input.assignee_id !== undefined && input.assignee_id !== null) {
      const assignee = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, input.assignee_id))
        .limit(1)
        .execute();

      if (assignee.length === 0) {
        throw new Error('Assignee user not found');
      }
    }

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.assignee_id !== undefined) updateData.assignee_id = input.assignee_id;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.due_date !== undefined) updateData.due_date = input.due_date;
    if (input.position !== undefined) updateData.position = input.position;

    // Handle status change with position reordering
    if (input.status !== undefined && input.status !== existingTask.status) {
      // Get the next position for the new status column
      const maxPositionResult = await db.select({
        maxPosition: max(tasksTable.position)
      })
        .from(tasksTable)
        .where(and(
          eq(tasksTable.project_id, existingTask.project_id),
          eq(tasksTable.status, input.status)
        ))
        .execute();

      const nextPosition = (maxPositionResult[0]?.maxPosition ?? -1) + 1;
      updateData.position = input.position !== undefined ? input.position : nextPosition;
    }

    // Update the task
    const result = await db.update(tasksTable)
      .set(updateData)
      .where(eq(tasksTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Task update failed:', error);
    throw error;
  }
}

// Move task to different status/position (for Kanban drag & drop)
export async function moveTask(input: MoveTaskInput): Promise<Task> {
  try {
    // First verify the task exists
    const existingTask = await getTaskById(input.id);
    if (!existingTask) {
      throw new Error('Task not found');
    }

    // If moving to the same status, just update position
    if (existingTask.status === input.status) {
      // Update positions of affected tasks in the same status column
      if (input.position < existingTask.position) {
        // Moving up: increment positions of tasks between new and old position
        await db.execute(sql`
          UPDATE ${tasksTable} 
          SET position = position + 1, updated_at = NOW() 
          WHERE project_id = ${existingTask.project_id} 
            AND status = ${input.status}
            AND position >= ${input.position} 
            AND position < ${existingTask.position}
        `);
      } else if (input.position > existingTask.position) {
        // Moving down: decrement positions of tasks between old and new position
        await db.execute(sql`
          UPDATE ${tasksTable} 
          SET position = position - 1, updated_at = NOW() 
          WHERE project_id = ${existingTask.project_id} 
            AND status = ${input.status}
            AND position > ${existingTask.position} 
            AND position <= ${input.position}
        `);
      }
    } else {
      // Moving to different status: increment positions in new column starting from insert position
      await db.execute(sql`
        UPDATE ${tasksTable} 
        SET position = position + 1, updated_at = NOW() 
        WHERE project_id = ${existingTask.project_id} 
          AND status = ${input.status}
          AND position >= ${input.position}
      `);

      // Decrement positions in old column for tasks after the moved task
      await db.execute(sql`
        UPDATE ${tasksTable} 
        SET position = position - 1, updated_at = NOW() 
        WHERE project_id = ${existingTask.project_id} 
          AND status = ${existingTask.status}
          AND position > ${existingTask.position}
      `);
    }

    // Update the moved task
    const result = await db.update(tasksTable)
      .set({
        status: input.status,
        position: input.position,
        updated_at: new Date()
      })
      .where(eq(tasksTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Task move failed:', error);
    throw error;
  }
}

// Delete a task
export async function deleteTask(id: number): Promise<boolean> {
  try {
    // First verify the task exists and get its info for position adjustment
    const existingTask = await getTaskById(id);
    if (!existingTask) {
      return false; // Return false instead of throwing error when task doesn't exist
    }

    // Delete the task (comments will be cascade deleted if foreign key constraints are set up properly)
    const result = await db.delete(tasksTable)
      .where(eq(tasksTable.id, id))
      .execute();

    // Adjust positions of remaining tasks in the same status column
    await db.execute(sql`
      UPDATE ${tasksTable} 
      SET position = position - 1, updated_at = NOW() 
      WHERE project_id = ${existingTask.project_id} 
        AND status = ${existingTask.status}
        AND position > ${existingTask.position}
    `);

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Task deletion failed:', error);
    throw error;
  }
}

// Get tasks assigned to a specific user
export async function getTasksByAssignee(assigneeId: number): Promise<Task[]> {
  try {
    // Verify assignee exists
    const assignee = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, assigneeId))
      .limit(1)
      .execute();

    if (assignee.length === 0) {
      throw new Error('Assignee user not found');
    }

    // Fetch all tasks assigned to the user, ordered by due date and priority
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.assignee_id, assigneeId))
      .orderBy(
        asc(tasksTable.due_date),
        desc(tasksTable.priority),
        asc(tasksTable.created_at)
      )
      .execute();

    return tasks;
  } catch (error) {
    console.error('Failed to fetch tasks by assignee:', error);
    throw error;
  }
}