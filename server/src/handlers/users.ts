import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput, type User } from '../schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// Create a new user
export async function createUser(input: CreateUserInput): Promise<User> {
  try {
    // Hash password if provided
    let passwordHash: string | null = null;
    if (input.password) {
      passwordHash = await bcrypt.hash(input.password, 10);
    }

    // Insert user record
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        name: input.name,
        password_hash: passwordHash,
        role: input.role,
        organization_id: input.organization_id,
        auth_provider: input.auth_provider
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

// Get all users in an organization
export async function getUsersByOrganization(organizationId: number): Promise<User[]> {
  try {
    const results = await db.select()
      .from(usersTable)
      .where(and(
        eq(usersTable.organization_id, organizationId),
        eq(usersTable.is_active, true)
      ))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch users by organization:', error);
    throw error;
  }
}

// Get a specific user by ID
export async function getUserById(id: number): Promise<User | null> {
  try {
    const results = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to fetch user by ID:', error);
    throw error;
  }
}

// Update user information
export async function updateUser(input: UpdateUserInput): Promise<User> {
  try {
    // Build update object with only provided fields
    const updateData: Partial<typeof usersTable.$inferInsert> = {
      updated_at: new Date()
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.role !== undefined) {
      updateData.role = input.role;
    }
    if (input.avatar_url !== undefined) {
      updateData.avatar_url = input.avatar_url;
    }
    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }

    // Update user record
    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`User with ID ${input.id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

// Deactivate a user (soft delete)
export async function deactivateUser(id: number): Promise<User> {
  try {
    const result = await db.update(usersTable)
      .set({ 
        is_active: false,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`User with ID ${id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('User deactivation failed:', error);
    throw error;
  }
}