import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { organizationsTable, usersTable, projectsTable, projectMembersTable } from '../db/schema';
import { type CreateProjectInput, type UpdateProjectInput, type GetProjectsInput } from '../schema';
import { createProject, getProjects, getProjectById, updateProject, deleteProject } from '../handlers/projects';
import { eq } from 'drizzle-orm';

describe('Projects Handler', () => {
  let testOrgId: number;
  let testUserId: number;

  beforeEach(async () => {
    await createDB();

    // Create test organization
    const orgResult = await db.insert(organizationsTable)
      .values({
        name: 'Test Organization',
        slug: 'test-org'
      })
      .returning()
      .execute();
    testOrgId = orgResult[0].id;

    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        name: 'Test User',
        password_hash: 'hashed_password',
        role: 'admin',
        organization_id: testOrgId,
        auth_provider: 'email'
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;
  });

  afterEach(resetDB);

  describe('createProject', () => {
    const testInput: CreateProjectInput = {
      name: 'Test Project',
      description: 'A project for testing',
      deadline: new Date('2024-12-31'),
      organization_id: 1, // Will be overridden with testOrgId
      created_by: 1 // Will be overridden with testUserId
    };

    it('should create a project successfully', async () => {
      const input = {
        ...testInput,
        organization_id: testOrgId,
        created_by: testUserId
      };

      const result = await createProject(input);

      expect(result.name).toEqual('Test Project');
      expect(result.description).toEqual('A project for testing');
      expect(result.deadline).toEqual(new Date('2024-12-31'));
      expect(result.organization_id).toEqual(testOrgId);
      expect(result.created_by).toEqual(testUserId);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a project with null optional fields', async () => {
      const input: CreateProjectInput = {
        name: 'Minimal Project',
        organization_id: testOrgId,
        created_by: testUserId
      };

      const result = await createProject(input);

      expect(result.name).toEqual('Minimal Project');
      expect(result.description).toBeNull();
      expect(result.deadline).toBeNull();
      expect(result.organization_id).toEqual(testOrgId);
      expect(result.created_by).toEqual(testUserId);
    });

    it('should save project to database', async () => {
      const input = {
        ...testInput,
        organization_id: testOrgId,
        created_by: testUserId
      };

      const result = await createProject(input);

      const projects = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.id, result.id))
        .execute();

      expect(projects).toHaveLength(1);
      expect(projects[0].name).toEqual('Test Project');
      expect(projects[0].organization_id).toEqual(testOrgId);
    });

    it('should automatically add creator as project admin', async () => {
      const input = {
        ...testInput,
        organization_id: testOrgId,
        created_by: testUserId
      };

      const result = await createProject(input);

      const members = await db.select()
        .from(projectMembersTable)
        .where(eq(projectMembersTable.project_id, result.id))
        .execute();

      expect(members).toHaveLength(1);
      expect(members[0].user_id).toEqual(testUserId);
      expect(members[0].role).toEqual('admin');
    });

    it('should handle foreign key constraint violation', async () => {
      const input: CreateProjectInput = {
        name: 'Invalid Project',
        organization_id: 99999, // Non-existent organization
        created_by: testUserId
      };

      await expect(createProject(input)).rejects.toThrow(/foreign key constraint/i);
    });
  });

  describe('getProjects', () => {
    beforeEach(async () => {
      // Create test projects
      await db.insert(projectsTable)
        .values([
          {
            name: 'Project 1',
            organization_id: testOrgId,
            created_by: testUserId
          },
          {
            name: 'Project 2',
            description: 'Second project',
            organization_id: testOrgId,
            created_by: testUserId
          }
        ])
        .execute();
    });

    it('should return all projects for an organization', async () => {
      const input: GetProjectsInput = {
        organization_id: testOrgId
      };

      const result = await getProjects(input);

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual('Project 1');
      expect(result[1].name).toEqual('Project 2');
      expect(result[1].description).toEqual('Second project');
    });

    it('should return empty array for organization with no projects', async () => {
      // Create another organization
      const anotherOrgResult = await db.insert(organizationsTable)
        .values({
          name: 'Empty Organization',
          slug: 'empty-org'
        })
        .returning()
        .execute();

      const input: GetProjectsInput = {
        organization_id: anotherOrgResult[0].id
      };

      const result = await getProjects(input);

      expect(result).toHaveLength(0);
    });
  });

  describe('getProjectById', () => {
    let projectId: number;

    beforeEach(async () => {
      const result = await db.insert(projectsTable)
        .values({
          name: 'Test Project',
          description: 'Test description',
          organization_id: testOrgId,
          created_by: testUserId
        })
        .returning()
        .execute();
      projectId = result[0].id;
    });

    it('should return project by ID', async () => {
      const result = await getProjectById(projectId);

      expect(result).toBeDefined();
      expect(result!.id).toEqual(projectId);
      expect(result!.name).toEqual('Test Project');
      expect(result!.description).toEqual('Test description');
    });

    it('should return null for non-existent project', async () => {
      const result = await getProjectById(99999);

      expect(result).toBeNull();
    });
  });

  describe('updateProject', () => {
    let projectId: number;

    beforeEach(async () => {
      const result = await db.insert(projectsTable)
        .values({
          name: 'Original Project',
          description: 'Original description',
          deadline: new Date('2024-06-01'),
          organization_id: testOrgId,
          created_by: testUserId
        })
        .returning()
        .execute();
      projectId = result[0].id;
    });

    it('should update all provided fields', async () => {
      const input: UpdateProjectInput = {
        id: projectId,
        name: 'Updated Project',
        description: 'Updated description',
        deadline: new Date('2024-12-31')
      };

      const result = await updateProject(input);

      expect(result.id).toEqual(projectId);
      expect(result.name).toEqual('Updated Project');
      expect(result.description).toEqual('Updated description');
      expect(result.deadline).toEqual(new Date('2024-12-31'));
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update only provided fields', async () => {
      const input: UpdateProjectInput = {
        id: projectId,
        name: 'Partially Updated Project'
      };

      const result = await updateProject(input);

      expect(result.name).toEqual('Partially Updated Project');
      expect(result.description).toEqual('Original description'); // Unchanged
      expect(result.deadline).toEqual(new Date('2024-06-01')); // Unchanged
    });

    it('should set fields to null when explicitly provided', async () => {
      const input: UpdateProjectInput = {
        id: projectId,
        description: null,
        deadline: null
      };

      const result = await updateProject(input);

      expect(result.description).toBeNull();
      expect(result.deadline).toBeNull();
      expect(result.name).toEqual('Original Project'); // Unchanged
    });

    it('should save updates to database', async () => {
      const input: UpdateProjectInput = {
        id: projectId,
        name: 'Database Updated Project'
      };

      await updateProject(input);

      const projects = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .execute();

      expect(projects[0].name).toEqual('Database Updated Project');
    });

    it('should throw error for non-existent project', async () => {
      const input: UpdateProjectInput = {
        id: 99999,
        name: 'Non-existent Project'
      };

      await expect(updateProject(input)).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteProject', () => {
    let projectId: number;

    beforeEach(async () => {
      const result = await db.insert(projectsTable)
        .values({
          name: 'Project to Delete',
          organization_id: testOrgId,
          created_by: testUserId
        })
        .returning()
        .execute();
      projectId = result[0].id;
    });

    it('should delete existing project', async () => {
      const result = await deleteProject(projectId);

      expect(result).toBe(true);

      // Verify project is deleted
      const projects = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .execute();

      expect(projects).toHaveLength(0);
    });

    it('should return false for non-existent project', async () => {
      const result = await deleteProject(99999);

      expect(result).toBe(false);
    });

    it('should remove project from database', async () => {
      await deleteProject(projectId);

      const projects = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .execute();

      expect(projects).toHaveLength(0);
    });
  });
});