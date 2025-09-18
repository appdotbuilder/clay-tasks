import { db } from '../db';
import { projectsTable, projectMembersTable } from '../db/schema';
import { type CreateProjectInput, type UpdateProjectInput, type GetProjectsInput, type Project } from '../schema';
import { eq, and } from 'drizzle-orm';
import { type SQL } from 'drizzle-orm';

// Create a new project
export async function createProject(input: CreateProjectInput): Promise<Project> {
  try {
    // Insert project record
    const result = await db.insert(projectsTable)
      .values({
        name: input.name,
        description: input.description || null,
        deadline: input.deadline || null,
        organization_id: input.organization_id,
        created_by: input.created_by
      })
      .returning()
      .execute();

    const project = result[0];

    // Automatically add creator as project admin
    await db.insert(projectMembersTable)
      .values({
        project_id: project.id,
        user_id: input.created_by,
        role: 'admin'
      })
      .execute();

    return project;
  } catch (error) {
    console.error('Project creation failed:', error);
    throw error;
  }
}

// Get all projects for an organization
export async function getProjects(input: GetProjectsInput): Promise<Project[]> {
  try {
    const results = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.organization_id, input.organization_id))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get projects:', error);
    throw error;
  }
}

// Get a specific project by ID
export async function getProjectById(id: number): Promise<Project | null> {
  try {
    const results = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get project by ID:', error);
    throw error;
  }
}

// Update project information
export async function updateProject(input: UpdateProjectInput): Promise<Project> {
  try {
    // Build update object with only provided fields
    const updateData: Partial<typeof projectsTable.$inferInsert> = {};
    
    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.deadline !== undefined) {
      updateData.deadline = input.deadline;
    }

    // Update with current timestamp
    updateData.updated_at = new Date();

    const result = await db.update(projectsTable)
      .set(updateData)
      .where(eq(projectsTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Project with id ${input.id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('Project update failed:', error);
    throw error;
  }
}

// Delete a project
export async function deleteProject(id: number): Promise<boolean> {
  try {
    // Delete project (cascading deletes will handle related records)
    const result = await db.delete(projectsTable)
      .where(eq(projectsTable.id, id))
      .returning()
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('Project deletion failed:', error);
    throw error;
  }
}