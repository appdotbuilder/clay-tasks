import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { organizationsTable, usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { createUser, getUsersByOrganization, getUserById, updateUser, deactivateUser } from '../handlers/users';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

describe('User handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let organizationId: number;
  let secondOrgId: number;

  // Create test organizations before each test
  beforeEach(async () => {
    // Create test organizations
    const orgResults = await db.insert(organizationsTable)
      .values([
        { name: 'Test Organization', slug: 'test-org' },
        { name: 'Second Organization', slug: 'second-org' }
      ])
      .returning()
      .execute();
    
    organizationId = orgResults[0].id;
    secondOrgId = orgResults[1].id;
  });

  describe('createUser', () => {
    const testInput: CreateUserInput = {
      email: 'test@example.com',
      name: 'Test User',
      role: 'member',
      organization_id: 1, // Will be updated in tests
      password: 'password123',
      auth_provider: 'email'
    };

    it('should create a user with password', async () => {
      const input = { ...testInput, organization_id: organizationId };
      const result = await createUser(input);

      expect(result.email).toEqual('test@example.com');
      expect(result.name).toEqual('Test User');
      expect(result.role).toEqual('member');
      expect(result.organization_id).toEqual(organizationId);
      expect(result.auth_provider).toEqual('email');
      expect(result.password_hash).toBeDefined();
      expect(result.password_hash).not.toEqual('password123'); // Should be hashed
      expect(result.google_id).toBeNull();
      expect(result.avatar_url).toBeNull();
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a user without password (OAuth)', async () => {
      const input: CreateUserInput = {
        email: 'oauth@example.com',
        name: 'OAuth User',
        role: 'member',
        organization_id: organizationId,
        auth_provider: 'google'
      };

      const result = await createUser(input);

      expect(result.email).toEqual('oauth@example.com');
      expect(result.name).toEqual('OAuth User');
      expect(result.auth_provider).toEqual('google');
      expect(result.password_hash).toBeNull();
      expect(result.is_active).toBe(true);
    });

    it('should hash password correctly', async () => {
      const input = { ...testInput, organization_id: organizationId };
      const result = await createUser(input);

      // Verify password was hashed correctly
      expect(result.password_hash).toBeDefined();
      const isValidPassword = await bcrypt.compare('password123', result.password_hash!);
      expect(isValidPassword).toBe(true);
    });

    it('should save user to database', async () => {
      const input = { ...testInput, organization_id: organizationId };
      const result = await createUser(input);

      // Verify user was saved to database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].email).toEqual('test@example.com');
      expect(users[0].name).toEqual('Test User');
      expect(users[0].organization_id).toEqual(organizationId);
    });

    it('should create user with admin role', async () => {
      const input: CreateUserInput = {
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
        organization_id: organizationId,
        password: 'adminpass123',
        auth_provider: 'email'
      };

      const result = await createUser(input);

      expect(result.role).toEqual('admin');
      expect(result.email).toEqual('admin@example.com');
    });

    it('should throw error for foreign key constraint violation', async () => {
      const input: CreateUserInput = {
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
        organization_id: 99999, // Non-existent organization
        password: 'password123',
        auth_provider: 'email'
      };

      await expect(createUser(input)).rejects.toThrow(/violates foreign key constraint/i);
    });
  });

  describe('getUsersByOrganization', () => {
    beforeEach(async () => {
      // Create test users in different organizations
      await db.insert(usersTable)
        .values([
          {
            email: 'user1@example.com',
            name: 'User 1',
            role: 'member',
            organization_id: organizationId,
            is_active: true,
            auth_provider: 'email'
          },
          {
            email: 'user2@example.com',
            name: 'User 2',
            role: 'admin',
            organization_id: organizationId,
            is_active: true,
            auth_provider: 'email'
          },
          {
            email: 'inactive@example.com',
            name: 'Inactive User',
            role: 'member',
            organization_id: organizationId,
            is_active: false, // Inactive user
            auth_provider: 'email'
          },
          {
            email: 'other@example.com',
            name: 'Other Org User',
            role: 'member',
            organization_id: secondOrgId, // Different organization
            is_active: true,
            auth_provider: 'email'
          }
        ])
        .execute();
    });

    it('should return active users from specific organization', async () => {
      const result = await getUsersByOrganization(organizationId);

      expect(result).toHaveLength(2);
      expect(result.every(user => user.organization_id === organizationId)).toBe(true);
      expect(result.every(user => user.is_active === true)).toBe(true);
      expect(result.map(user => user.email)).toEqual(
        expect.arrayContaining(['user1@example.com', 'user2@example.com'])
      );
    });

    it('should not return inactive users', async () => {
      const result = await getUsersByOrganization(organizationId);

      const inactiveUser = result.find(user => user.email === 'inactive@example.com');
      expect(inactiveUser).toBeUndefined();
    });

    it('should not return users from other organizations', async () => {
      const result = await getUsersByOrganization(organizationId);

      const otherOrgUser = result.find(user => user.email === 'other@example.com');
      expect(otherOrgUser).toBeUndefined();
    });

    it('should return empty array for organization with no active users', async () => {
      // Create new organization with no users
      const newOrgResult = await db.insert(organizationsTable)
        .values({ name: 'Empty Organization', slug: 'empty-org' })
        .returning()
        .execute();

      const result = await getUsersByOrganization(newOrgResult[0].id);
      expect(result).toHaveLength(0);
    });
  });

  describe('getUserById', () => {
    let testUserId: number;

    beforeEach(async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          name: 'Test User',
          role: 'member',
          organization_id: organizationId,
          is_active: true,
          auth_provider: 'email'
        })
        .returning()
        .execute();
      
      testUserId = userResult[0].id;
    });

    it('should return user when found', async () => {
      const result = await getUserById(testUserId);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(testUserId);
      expect(result!.email).toEqual('test@example.com');
      expect(result!.name).toEqual('Test User');
      expect(result!.organization_id).toEqual(organizationId);
    });

    it('should return null when user not found', async () => {
      const result = await getUserById(99999);
      expect(result).toBeNull();
    });

    it('should return inactive user', async () => {
      // Deactivate the user
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.id, testUserId))
        .execute();

      const result = await getUserById(testUserId);

      expect(result).not.toBeNull();
      expect(result!.is_active).toBe(false);
    });
  });

  describe('updateUser', () => {
    let testUserId: number;

    beforeEach(async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          name: 'Original Name',
          role: 'member',
          organization_id: organizationId,
          is_active: true,
          auth_provider: 'email',
          avatar_url: null
        })
        .returning()
        .execute();
      
      testUserId = userResult[0].id;
    });

    it('should update user name', async () => {
      const input: UpdateUserInput = {
        id: testUserId,
        name: 'Updated Name'
      };

      const result = await updateUser(input);

      expect(result.id).toEqual(testUserId);
      expect(result.name).toEqual('Updated Name');
      expect(result.email).toEqual('test@example.com'); // Should remain unchanged
    });

    it('should update user role', async () => {
      const input: UpdateUserInput = {
        id: testUserId,
        role: 'admin'
      };

      const result = await updateUser(input);

      expect(result.role).toEqual('admin');
      expect(result.name).toEqual('Original Name'); // Should remain unchanged
    });

    it('should update multiple fields', async () => {
      const input: UpdateUserInput = {
        id: testUserId,
        name: 'New Name',
        role: 'manager',
        avatar_url: 'https://example.com/avatar.jpg',
        is_active: false
      };

      const result = await updateUser(input);

      expect(result.name).toEqual('New Name');
      expect(result.role).toEqual('manager');
      expect(result.avatar_url).toEqual('https://example.com/avatar.jpg');
      expect(result.is_active).toBe(false);
    });

    it('should update avatar_url to null', async () => {
      // First set an avatar URL
      await updateUser({
        id: testUserId,
        avatar_url: 'https://example.com/avatar.jpg'
      });

      // Then set it to null
      const input: UpdateUserInput = {
        id: testUserId,
        avatar_url: null
      };

      const result = await updateUser(input);

      expect(result.avatar_url).toBeNull();
    });

    it('should update updated_at timestamp', async () => {
      const originalUser = await getUserById(testUserId);
      const originalUpdatedAt = originalUser!.updated_at;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const input: UpdateUserInput = {
        id: testUserId,
        name: 'Updated Name'
      };

      const result = await updateUser(input);

      expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should persist changes to database', async () => {
      const input: UpdateUserInput = {
        id: testUserId,
        name: 'Database Update Test',
        role: 'admin'
      };

      await updateUser(input);

      // Verify changes were saved
      const userFromDb = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, testUserId))
        .execute();

      expect(userFromDb[0].name).toEqual('Database Update Test');
      expect(userFromDb[0].role).toEqual('admin');
    });

    it('should throw error when user not found', async () => {
      const input: UpdateUserInput = {
        id: 99999,
        name: 'Non-existent User'
      };

      await expect(updateUser(input)).rejects.toThrow(/User with ID 99999 not found/);
    });
  });

  describe('deactivateUser', () => {
    let testUserId: number;

    beforeEach(async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          name: 'Test User',
          role: 'member',
          organization_id: organizationId,
          is_active: true,
          auth_provider: 'email'
        })
        .returning()
        .execute();
      
      testUserId = userResult[0].id;
    });

    it('should deactivate an active user', async () => {
      const result = await deactivateUser(testUserId);

      expect(result.id).toEqual(testUserId);
      expect(result.is_active).toBe(false);
      expect(result.email).toEqual('test@example.com'); // Other fields should remain
      expect(result.name).toEqual('Test User');
    });

    it('should update updated_at timestamp', async () => {
      const originalUser = await getUserById(testUserId);
      const originalUpdatedAt = originalUser!.updated_at;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await deactivateUser(testUserId);

      expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should persist deactivation to database', async () => {
      await deactivateUser(testUserId);

      // Verify change was saved
      const userFromDb = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, testUserId))
        .execute();

      expect(userFromDb[0].is_active).toBe(false);
    });

    it('should deactivate already inactive user', async () => {
      // First deactivate the user
      await deactivateUser(testUserId);

      // Deactivate again
      const result = await deactivateUser(testUserId);

      expect(result.is_active).toBe(false);
    });

    it('should throw error when user not found', async () => {
      await expect(deactivateUser(99999)).rejects.toThrow(/User with ID 99999 not found/);
    });
  });
});