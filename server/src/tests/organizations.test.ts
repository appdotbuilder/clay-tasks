import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { organizationsTable } from '../db/schema';
import { type CreateOrganizationInput } from '../schema';
import { 
  createOrganization, 
  getOrganizationById, 
  getOrganizationBySlug, 
  updateOrganization 
} from '../handlers/organizations';
import { eq } from 'drizzle-orm';

// Test input data
const testOrgInput: CreateOrganizationInput = {
  name: 'Test Organization',
  slug: 'test-org'
};

const testOrgInput2: CreateOrganizationInput = {
  name: 'Another Organization',
  slug: 'another-org'
};

describe('organizations handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createOrganization', () => {
    it('should create a new organization', async () => {
      const result = await createOrganization(testOrgInput);

      expect(result.id).toBeDefined();
      expect(result.name).toEqual('Test Organization');
      expect(result.slug).toEqual('test-org');
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save organization to database', async () => {
      const result = await createOrganization(testOrgInput);

      const savedOrgs = await db.select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, result.id))
        .execute();

      expect(savedOrgs).toHaveLength(1);
      expect(savedOrgs[0].name).toEqual('Test Organization');
      expect(savedOrgs[0].slug).toEqual('test-org');
    });

    it('should throw error for duplicate slug', async () => {
      // Create first organization
      await createOrganization(testOrgInput);

      // Try to create another with same slug
      await expect(createOrganization(testOrgInput))
        .rejects.toThrow(/slug.*already exists/i);
    });

    it('should allow different slugs', async () => {
      const org1 = await createOrganization(testOrgInput);
      const org2 = await createOrganization(testOrgInput2);

      expect(org1.id).not.toEqual(org2.id);
      expect(org1.slug).toEqual('test-org');
      expect(org2.slug).toEqual('another-org');
    });
  });

  describe('getOrganizationById', () => {
    it('should return organization when found', async () => {
      const created = await createOrganization(testOrgInput);
      const result = await getOrganizationById(created.id);

      expect(result).not.toBeNull();
      expect(result?.id).toEqual(created.id);
      expect(result?.name).toEqual('Test Organization');
      expect(result?.slug).toEqual('test-org');
    });

    it('should return null when organization not found', async () => {
      const result = await getOrganizationById(99999);

      expect(result).toBeNull();
    });

    it('should return correct organization among multiple', async () => {
      const org1 = await createOrganization(testOrgInput);
      const org2 = await createOrganization(testOrgInput2);

      const result1 = await getOrganizationById(org1.id);
      const result2 = await getOrganizationById(org2.id);

      expect(result1?.slug).toEqual('test-org');
      expect(result2?.slug).toEqual('another-org');
    });
  });

  describe('getOrganizationBySlug', () => {
    it('should return organization when found', async () => {
      const created = await createOrganization(testOrgInput);
      const result = await getOrganizationBySlug('test-org');

      expect(result).not.toBeNull();
      expect(result?.id).toEqual(created.id);
      expect(result?.name).toEqual('Test Organization');
      expect(result?.slug).toEqual('test-org');
    });

    it('should return null when organization not found', async () => {
      const result = await getOrganizationBySlug('nonexistent-slug');

      expect(result).toBeNull();
    });

    it('should be case sensitive', async () => {
      await createOrganization(testOrgInput);

      const result1 = await getOrganizationBySlug('test-org');
      const result2 = await getOrganizationBySlug('TEST-ORG');

      expect(result1).not.toBeNull();
      expect(result2).toBeNull();
    });

    it('should return correct organization among multiple', async () => {
      await createOrganization(testOrgInput);
      await createOrganization(testOrgInput2);

      const result1 = await getOrganizationBySlug('test-org');
      const result2 = await getOrganizationBySlug('another-org');

      expect(result1?.name).toEqual('Test Organization');
      expect(result2?.name).toEqual('Another Organization');
    });
  });

  describe('updateOrganization', () => {
    it('should update organization name', async () => {
      const created = await createOrganization(testOrgInput);
      const updated = await updateOrganization(created.id, 'Updated Organization');

      expect(updated.id).toEqual(created.id);
      expect(updated.name).toEqual('Updated Organization');
      expect(updated.slug).toEqual('test-org'); // slug should remain unchanged
      expect(updated.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    });

    it('should save updated organization to database', async () => {
      const created = await createOrganization(testOrgInput);
      await updateOrganization(created.id, 'Updated Organization');

      const savedOrg = await db.select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, created.id))
        .execute();

      expect(savedOrg).toHaveLength(1);
      expect(savedOrg[0].name).toEqual('Updated Organization');
      expect(savedOrg[0].slug).toEqual('test-org');
    });

    it('should throw error when organization not found', async () => {
      await expect(updateOrganization(99999, 'Updated Name'))
        .rejects.toThrow(/not found/i);
    });

    it('should preserve other fields when updating', async () => {
      const created = await createOrganization(testOrgInput);
      const updated = await updateOrganization(created.id, 'New Name');

      expect(updated.slug).toEqual(created.slug);
      expect(updated.created_at.getTime()).toEqual(created.created_at.getTime());
    });
  });

  describe('edge cases', () => {
    it('should handle empty name gracefully', async () => {
      const input = { name: '', slug: 'empty-name' };
      const result = await createOrganization(input);

      expect(result.name).toEqual('');
      expect(result.slug).toEqual('empty-name');
    });

    it('should handle special characters in slug', async () => {
      const input = { name: 'Special Org', slug: 'org-with-123_special.chars' };
      const result = await createOrganization(input);

      expect(result.slug).toEqual('org-with-123_special.chars');
    });

    it('should handle long names and slugs', async () => {
      const longName = 'A'.repeat(255);
      const longSlug = 'a'.repeat(100);
      const input = { name: longName, slug: longSlug };
      
      const result = await createOrganization(input);

      expect(result.name).toEqual(longName);
      expect(result.slug).toEqual(longSlug);
    });
  });
});