import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { organizationsTable, usersTable, projectsTable, projectMembersTable, tasksTable } from '../db/schema';
import { type AddProjectMemberInput } from '../schema';
import { 
  addProjectMember, 
  getProjectMembers, 
  updateProjectMemberRole, 
  removeProjectMember, 
  isProjectMember, 
  getUserProjectRole 
} from '../handlers/project_members';
import { eq, and } from 'drizzle-orm';

describe('Project Members Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup
  let organizationId: number;
  let userId1: number;
  let userId2: number;
  let projectId: number;
  let otherOrgId: number;
  let otherUserId: number;

  beforeEach(async () => {
    // Create organizations
    const orgResults = await db.insert(organizationsTable)
      .values([
        { name: 'Test Org', slug: 'test-org' },
        { name: 'Other Org', slug: 'other-org' }
      ])
      .returning()
      .execute();

    organizationId = orgResults[0].id;
    otherOrgId = orgResults[1].id;

    // Create users
    const userResults = await db.insert(usersTable)
      .values([
        {
          email: 'user1@test.com',
          name: 'User 1',
          password_hash: 'hash1',
          role: 'member',
          organization_id: organizationId
        },
        {
          email: 'user2@test.com',
          name: 'User 2',
          password_hash: 'hash2',
          role: 'member',
          organization_id: organizationId
        },
        {
          email: 'other@test.com',
          name: 'Other User',
          password_hash: 'hash3',
          role: 'member',
          organization_id: otherOrgId
        }
      ])
      .returning()
      .execute();

    userId1 = userResults[0].id;
    userId2 = userResults[1].id;
    otherUserId = userResults[2].id;

    // Create a project
    const projectResults = await db.insert(projectsTable)
      .values({
        name: 'Test Project',
        organization_id: organizationId,
        created_by: userId1
      })
      .returning()
      .execute();

    projectId = projectResults[0].id;
  });

  describe('addProjectMember', () => {
    it('should add a member to a project', async () => {
      const input: AddProjectMemberInput = {
        project_id: projectId,
        user_id: userId2,
        role: 'member'
      };

      const result = await addProjectMember(input);

      expect(result.id).toBeDefined();
      expect(result.project_id).toBe(projectId);
      expect(result.user_id).toBe(userId2);
      expect(result.role).toBe('member');
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save member to database', async () => {
      const input: AddProjectMemberInput = {
        project_id: projectId,
        user_id: userId2,
        role: 'admin'
      };

      const result = await addProjectMember(input);

      const members = await db.select()
        .from(projectMembersTable)
        .where(eq(projectMembersTable.id, result.id))
        .execute();

      expect(members).toHaveLength(1);
      expect(members[0].project_id).toBe(projectId);
      expect(members[0].user_id).toBe(userId2);
      expect(members[0].role).toBe('admin');
    });

    it('should throw error if user not found', async () => {
      const input: AddProjectMemberInput = {
        project_id: projectId,
        user_id: 99999,
        role: 'member'
      };

      await expect(addProjectMember(input)).rejects.toThrow(/user not found/i);
    });

    it('should throw error if project not found', async () => {
      const input: AddProjectMemberInput = {
        project_id: 99999,
        user_id: userId2,
        role: 'member'
      };

      await expect(addProjectMember(input)).rejects.toThrow(/project not found/i);
    });

    it('should throw error if user is from different organization', async () => {
      const input: AddProjectMemberInput = {
        project_id: projectId,
        user_id: otherUserId,
        role: 'member'
      };

      await expect(addProjectMember(input)).rejects.toThrow(/same organization/i);
    });

    it('should throw error if user is already a member', async () => {
      const input: AddProjectMemberInput = {
        project_id: projectId,
        user_id: userId2,
        role: 'member'
      };

      await addProjectMember(input);

      await expect(addProjectMember(input)).rejects.toThrow(/already a member/i);
    });
  });

  describe('getProjectMembers', () => {
    it('should return empty array for project with no members', async () => {
      const result = await getProjectMembers(projectId);
      expect(result).toEqual([]);
    });

    it('should return all members of a project', async () => {
      // Add two members
      await addProjectMember({
        project_id: projectId,
        user_id: userId1,
        role: 'admin'
      });

      await addProjectMember({
        project_id: projectId,
        user_id: userId2,
        role: 'member'
      });

      const result = await getProjectMembers(projectId);

      expect(result).toHaveLength(2);
      expect(result.some(m => m.user_id === userId1 && m.role === 'admin')).toBe(true);
      expect(result.some(m => m.user_id === userId2 && m.role === 'member')).toBe(true);
    });

    it('should only return members for specified project', async () => {
      // Create another project
      const otherProjectResults = await db.insert(projectsTable)
        .values({
          name: 'Other Project',
          organization_id: organizationId,
          created_by: userId1
        })
        .returning()
        .execute();

      const otherProjectId = otherProjectResults[0].id;

      // Add member to first project
      await addProjectMember({
        project_id: projectId,
        user_id: userId1,
        role: 'admin'
      });

      // Add member to second project
      await addProjectMember({
        project_id: otherProjectId,
        user_id: userId2,
        role: 'member'
      });

      const result = await getProjectMembers(projectId);

      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe(userId1);
      expect(result[0].project_id).toBe(projectId);
    });
  });

  describe('updateProjectMemberRole', () => {
    it('should update member role', async () => {
      // First add a member
      await addProjectMember({
        project_id: projectId,
        user_id: userId2,
        role: 'member'
      });

      const result = await updateProjectMemberRole(projectId, userId2, 'admin');

      expect(result.role).toBe('admin');
      expect(result.project_id).toBe(projectId);
      expect(result.user_id).toBe(userId2);
    });

    it('should save updated role to database', async () => {
      // First add a member
      await addProjectMember({
        project_id: projectId,
        user_id: userId2,
        role: 'member'
      });

      await updateProjectMemberRole(projectId, userId2, 'manager');

      const members = await db.select()
        .from(projectMembersTable)
        .where(and(
          eq(projectMembersTable.project_id, projectId),
          eq(projectMembersTable.user_id, userId2)
        ))
        .execute();

      expect(members).toHaveLength(1);
      expect(members[0].role).toBe('manager');
    });

    it('should throw error if membership not found', async () => {
      await expect(updateProjectMemberRole(projectId, userId2, 'admin'))
        .rejects.toThrow(/membership not found/i);
    });
  });

  describe('removeProjectMember', () => {
    it('should remove member from project', async () => {
      // First add a member
      await addProjectMember({
        project_id: projectId,
        user_id: userId2,
        role: 'member'
      });

      const result = await removeProjectMember(projectId, userId2);

      expect(result).toBe(true);

      // Verify member was removed from database
      const members = await db.select()
        .from(projectMembersTable)
        .where(and(
          eq(projectMembersTable.project_id, projectId),
          eq(projectMembersTable.user_id, userId2)
        ))
        .execute();

      expect(members).toHaveLength(0);
    });

    it('should unassign tasks when removing member', async () => {
      // First add a member
      await addProjectMember({
        project_id: projectId,
        user_id: userId2,
        role: 'member'
      });

      // Create a task assigned to the user
      const taskResults = await db.insert(tasksTable)
        .values({
          title: 'Test Task',
          project_id: projectId,
          assignee_id: userId2,
          created_by: userId1
        })
        .returning()
        .execute();

      const taskId = taskResults[0].id;

      await removeProjectMember(projectId, userId2);

      // Verify task assignee was cleared
      const tasks = await db.select()
        .from(tasksTable)
        .where(eq(tasksTable.id, taskId))
        .execute();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].assignee_id).toBeNull();
    });

    it('should throw error if membership not found', async () => {
      await expect(removeProjectMember(projectId, userId2))
        .rejects.toThrow(/membership not found/i);
    });
  });

  describe('isProjectMember', () => {
    it('should return true if user is project member', async () => {
      await addProjectMember({
        project_id: projectId,
        user_id: userId2,
        role: 'member'
      });

      const result = await isProjectMember(projectId, userId2);
      expect(result).toBe(true);
    });

    it('should return false if user is not project member', async () => {
      const result = await isProjectMember(projectId, userId2);
      expect(result).toBe(false);
    });

    it('should return false for non-existent project or user', async () => {
      const result1 = await isProjectMember(99999, userId2);
      const result2 = await isProjectMember(projectId, 99999);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe('getUserProjectRole', () => {
    it('should return user role if member', async () => {
      await addProjectMember({
        project_id: projectId,
        user_id: userId2,
        role: 'admin'
      });

      const result = await getUserProjectRole(projectId, userId2);
      expect(result).toBe('admin');
    });

    it('should return null if user is not member', async () => {
      const result = await getUserProjectRole(projectId, userId2);
      expect(result).toBeNull();
    });

    it('should return null for non-existent project or user', async () => {
      const result1 = await getUserProjectRole(99999, userId2);
      const result2 = await getUserProjectRole(projectId, 99999);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should return correct role for different users', async () => {
      await addProjectMember({
        project_id: projectId,
        user_id: userId1,
        role: 'manager'
      });

      await addProjectMember({
        project_id: projectId,
        user_id: userId2,
        role: 'viewer'
      });

      const role1 = await getUserProjectRole(projectId, userId1);
      const role2 = await getUserProjectRole(projectId, userId2);

      expect(role1).toBe('manager');
      expect(role2).toBe('viewer');
    });
  });
});