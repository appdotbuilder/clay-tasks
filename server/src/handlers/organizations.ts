import { db } from '../db';
import { organizationsTable } from '../db/schema';
import { type CreateOrganizationInput, type Organization } from '../schema';
import { eq } from 'drizzle-orm';

// Create a new organization
export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  try {
    // Check if slug already exists
    const existingOrg = await db.select()
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, input.slug))
      .execute();

    if (existingOrg.length > 0) {
      throw new Error(`Organization with slug '${input.slug}' already exists`);
    }

    // Create new organization
    const result = await db.insert(organizationsTable)
      .values({
        name: input.name,
        slug: input.slug
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Organization creation failed:', error);
    throw error;
  }
}

// Get organization by ID
export async function getOrganizationById(id: number): Promise<Organization | null> {
  try {
    const result = await db.select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, id))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to get organization by ID:', error);
    throw error;
  }
}

// Get organization by slug
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  try {
    const result = await db.select()
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, slug))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to get organization by slug:', error);
    throw error;
  }
}

// Update organization
export async function updateOrganization(id: number, name: string): Promise<Organization> {
  try {
    // Check if organization exists
    const existingOrg = await getOrganizationById(id);
    if (!existingOrg) {
      throw new Error(`Organization with ID ${id} not found`);
    }

    // Update organization
    const result = await db.update(organizationsTable)
      .set({
        name: name,
        updated_at: new Date()
      })
      .where(eq(organizationsTable.id, id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Organization update failed:', error);
    throw error;
  }
}