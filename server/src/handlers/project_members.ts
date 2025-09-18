import { db } from '../db';
import { projectMembersTable, usersTable, projectsTable, tasksTable } from '../db/schema';
import { type AddProjectMemberInput, type ProjectMember } from '../schema';
import { eq, and } from 'drizzle-orm';

// Add a member to a project
export async function addProjectMember(input: AddProjectMemberInput): Promise<ProjectMember> {
  try {
    // Verify the user exists and the project exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    const project = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, input.project_id))
      .execute();

    if (project.length === 0) {
      throw new Error('Project not found');
    }

    // Verify user is in the same organization as the project
    if (user[0].organization_id !== project[0].organization_id) {
      throw new Error('User must be in the same organization as the project');
    }

    // Check if user is not already a member of the project
    const existingMember = await db.select()
      .from(projectMembersTable)
      .where(and(
        eq(projectMembersTable.project_id, input.project_id),
        eq(projectMembersTable.user_id, input.user_id)
      ))
      .execute();

    if (existingMember.length > 0) {
      throw new Error('User is already a member of this project');
    }

    // Add user to project with specified role
    const result = await db.insert(projectMembersTable)
      .values({
        project_id: input.project_id,
        user_id: input.user_id,
        role: input.role
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Add project member failed:', error);
    throw error;
  }
}

// Get all members of a project
export async function getProjectMembers(projectId: number): Promise<ProjectMember[]> {
  try {
    const result = await db.select()
      .from(projectMembersTable)
      .where(eq(projectMembersTable.project_id, projectId))
      .execute();

    return result;
  } catch (error) {
    console.error('Get project members failed:', error);
    throw error;
  }
}

// Update project member role
export async function updateProjectMemberRole(projectId: number, userId: number, role: 'admin' | 'manager' | 'member' | 'viewer'): Promise<ProjectMember> {
  try {
    // Find the project membership
    const existingMember = await db.select()
      .from(projectMembersTable)
      .where(and(
        eq(projectMembersTable.project_id, projectId),
        eq(projectMembersTable.user_id, userId)
      ))
      .execute();

    if (existingMember.length === 0) {
      throw new Error('Project membership not found');
    }

    // Update the role
    const result = await db.update(projectMembersTable)
      .set({ role: role })
      .where(and(
        eq(projectMembersTable.project_id, projectId),
        eq(projectMembersTable.user_id, userId)
      ))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Update project member role failed:', error);
    throw error;
  }
}

// Remove a member from a project
export async function removeProjectMember(projectId: number, userId: number): Promise<boolean> {
  try {
    // Find the project membership
    const existingMember = await db.select()
      .from(projectMembersTable)
      .where(and(
        eq(projectMembersTable.project_id, projectId),
        eq(projectMembersTable.user_id, userId)
      ))
      .execute();

    if (existingMember.length === 0) {
      throw new Error('Project membership not found');
    }

    // Unassign any tasks assigned to this user in the project
    await db.update(tasksTable)
      .set({ assignee_id: null })
      .where(and(
        eq(tasksTable.project_id, projectId),
        eq(tasksTable.assignee_id, userId)
      ))
      .execute();

    // Delete the project membership
    await db.delete(projectMembersTable)
      .where(and(
        eq(projectMembersTable.project_id, projectId),
        eq(projectMembersTable.user_id, userId)
      ))
      .execute();

    return true;
  } catch (error) {
    console.error('Remove project member failed:', error);
    throw error;
  }
}

// Check if user is a member of a project
export async function isProjectMember(projectId: number, userId: number): Promise<boolean> {
  try {
    const result = await db.select()
      .from(projectMembersTable)
      .where(and(
        eq(projectMembersTable.project_id, projectId),
        eq(projectMembersTable.user_id, userId)
      ))
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('Check project member failed:', error);
    throw error;
  }
}

// Get user's role in a project
export async function getUserProjectRole(projectId: number, userId: number): Promise<'admin' | 'manager' | 'member' | 'viewer' | null> {
  try {
    const result = await db.select()
      .from(projectMembersTable)
      .where(and(
        eq(projectMembersTable.project_id, projectId),
        eq(projectMembersTable.user_id, userId)
      ))
      .execute();

    if (result.length === 0) {
      return null;
    }

    return result[0].role;
  } catch (error) {
    console.error('Get user project role failed:', error);
    throw error;
  }
}