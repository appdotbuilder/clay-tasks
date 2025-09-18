import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { organizationsTable, usersTable, invitationsTable } from '../db/schema';
import { type CreateInvitationInput, type AcceptInvitationInput } from '../schema';
import { 
  createInvitation, 
  acceptInvitation, 
  getInvitationByToken,
  getPendingInvitations,
  revokeInvitation,
  resendInvitation 
} from '../handlers/invitations';
import { eq } from 'drizzle-orm';
// Note: Using simplified password hashing for testing

describe('Invitation handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test organization and user
  async function createTestData() {
    // Create organization
    const org = await db.insert(organizationsTable)
      .values({
        name: 'Test Organization',
        slug: 'test-org'
      })
      .returning()
      .execute();

    // Create inviting user
    const passwordHash = 'hashed_password123_test';
    const user = await db.insert(usersTable)
      .values({
        email: 'admin@test.com',
        name: 'Admin User',
        password_hash: passwordHash,
        role: 'admin',
        organization_id: org[0].id,
        auth_provider: 'email'
      })
      .returning()
      .execute();

    return { organization: org[0], user: user[0] };
  }

  describe('createInvitation', () => {
    it('should create a new invitation successfully', async () => {
      const { organization, user } = await createTestData();
      
      const input: CreateInvitationInput = {
        email: 'invited@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      };

      const result = await createInvitation(input);

      expect(result.email).toEqual('invited@test.com');
      expect(result.organization_id).toEqual(organization.id);
      expect(result.role).toEqual('member');
      expect(result.invited_by).toEqual(user.id);
      expect(result.id).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.expires_at).toBeInstanceOf(Date);
      expect(result.accepted_at).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should set expiration date 7 days from now', async () => {
      const { organization, user } = await createTestData();
      
      const input: CreateInvitationInput = {
        email: 'invited@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      };

      const before = new Date();
      const result = await createInvitation(input);
      const after = new Date();

      const expectedExpiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const timeDiff = Math.abs(result.expires_at.getTime() - expectedExpiration.getTime());
      
      // Allow for 5 seconds of execution time variation
      expect(timeDiff).toBeLessThan(5000);
    });

    it('should throw error if email is already registered in organization', async () => {
      const { organization, user } = await createTestData();
      
      const input: CreateInvitationInput = {
        email: user.email,
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      };

      await expect(createInvitation(input)).rejects.toThrow(/already a member/i);
    });

    it('should throw error if pending invitation already exists', async () => {
      const { organization, user } = await createTestData();
      
      const input: CreateInvitationInput = {
        email: 'invited@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      };

      // Create first invitation
      await createInvitation(input);

      // Try to create duplicate invitation
      await expect(createInvitation(input)).rejects.toThrow(/pending invitation already exists/i);
    });

    it('should save invitation to database', async () => {
      const { organization, user } = await createTestData();
      
      const input: CreateInvitationInput = {
        email: 'invited@test.com',
        organization_id: organization.id,
        role: 'manager',
        invited_by: user.id
      };

      const result = await createInvitation(input);

      // Query database to verify invitation was saved
      const invitations = await db.select()
        .from(invitationsTable)
        .where(eq(invitationsTable.id, result.id))
        .execute();

      expect(invitations).toHaveLength(1);
      expect(invitations[0].email).toEqual('invited@test.com');
      expect(invitations[0].role).toEqual('manager');
      expect(invitations[0].token).toBeDefined();
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation and create user successfully', async () => {
      const { organization, user } = await createTestData();
      
      // Create invitation first
      const invitation = await createInvitation({
        email: 'newuser@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const input: AcceptInvitationInput = {
        token: invitation.token,
        name: 'New User',
        password: 'password123'
      };

      const result = await acceptInvitation(input);

      expect(result.user.email).toEqual('newuser@test.com');
      expect(result.user.name).toEqual('New User');
      expect(result.user.role).toEqual('member');
      expect(result.user.organization_id).toEqual(organization.id);
      expect(result.user.auth_provider).toEqual('email');
      expect(result.user.password_hash).toBeDefined();
      expect(result.user.is_active).toBe(true);
      expect(result.token).toBeDefined();
    });

    it('should hash the password correctly', async () => {
      const { organization, user } = await createTestData();
      
      const invitation = await createInvitation({
        email: 'newuser@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const input: AcceptInvitationInput = {
        token: invitation.token,
        name: 'New User',
        password: 'password123'
      };

      const result = await acceptInvitation(input);

      // Verify password was hashed (not stored as plain text)
      expect(result.user.password_hash).not.toEqual('password123');
      expect(result.user.password_hash).toContain('hashed_');
      expect(result.user.password_hash).toContain('password123');
    });

    it('should mark invitation as accepted', async () => {
      const { organization, user } = await createTestData();
      
      const invitation = await createInvitation({
        email: 'newuser@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const input: AcceptInvitationInput = {
        token: invitation.token,
        name: 'New User',
        password: 'password123'
      };

      await acceptInvitation(input);

      // Check invitation is marked as accepted
      const updatedInvitation = await db.select()
        .from(invitationsTable)
        .where(eq(invitationsTable.id, invitation.id))
        .execute();

      expect(updatedInvitation[0].accepted_at).toBeInstanceOf(Date);
    });

    it('should throw error for invalid token', async () => {
      const input: AcceptInvitationInput = {
        token: 'invalid-token',
        name: 'New User',
        password: 'password123'
      };

      await expect(acceptInvitation(input)).rejects.toThrow(/invalid invitation token/i);
    });

    it('should throw error for already accepted invitation', async () => {
      const { organization, user } = await createTestData();
      
      const invitation = await createInvitation({
        email: 'newuser@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const input: AcceptInvitationInput = {
        token: invitation.token,
        name: 'New User',
        password: 'password123'
      };

      // Accept invitation first time
      await acceptInvitation(input);

      // Try to accept again
      await expect(acceptInvitation(input)).rejects.toThrow(/already been accepted/i);
    });

    it('should throw error for expired invitation', async () => {
      const { organization, user } = await createTestData();
      
      // Create invitation with past expiration date
      const expiredInvitation = await db.insert(invitationsTable)
        .values({
          email: 'expired@test.com',
          organization_id: organization.id,
          role: 'member',
          token: 'expired-token',
          expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          invited_by: user.id
        })
        .returning()
        .execute();

      const input: AcceptInvitationInput = {
        token: 'expired-token',
        name: 'New User',
        password: 'password123'
      };

      await expect(acceptInvitation(input)).rejects.toThrow(/invitation has expired/i);
    });
  });

  describe('getInvitationByToken', () => {
    it('should return invitation for valid token', async () => {
      const { organization, user } = await createTestData();
      
      const invitation = await createInvitation({
        email: 'invited@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const result = await getInvitationByToken(invitation.token);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(invitation.id);
      expect(result!.email).toEqual('invited@test.com');
    });

    it('should return null for invalid token', async () => {
      const result = await getInvitationByToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for expired invitation', async () => {
      const { organization, user } = await createTestData();
      
      // Create expired invitation
      const expiredInvitation = await db.insert(invitationsTable)
        .values({
          email: 'expired@test.com',
          organization_id: organization.id,
          role: 'member',
          token: 'expired-token',
          expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          invited_by: user.id
        })
        .returning()
        .execute();

      const result = await getInvitationByToken('expired-token');
      expect(result).toBeNull();
    });

    it('should return null for accepted invitation', async () => {
      const { organization, user } = await createTestData();
      
      // Create and accept invitation
      const invitation = await createInvitation({
        email: 'accepted@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      await acceptInvitation({
        token: invitation.token,
        name: 'Accepted User',
        password: 'password123'
      });

      const result = await getInvitationByToken(invitation.token);
      expect(result).toBeNull();
    });
  });

  describe('getPendingInvitations', () => {
    it('should return pending invitations for organization', async () => {
      const { organization, user } = await createTestData();
      
      // Create multiple invitations
      await createInvitation({
        email: 'user1@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      await createInvitation({
        email: 'user2@test.com',
        organization_id: organization.id,
        role: 'manager',
        invited_by: user.id
      });

      const result = await getPendingInvitations(organization.id);

      expect(result).toHaveLength(2);
      expect(result[0].email).toMatch(/user[12]@test\.com/);
      expect(result[1].email).toMatch(/user[12]@test\.com/);
    });

    it('should not return accepted invitations', async () => {
      const { organization, user } = await createTestData();
      
      // Create invitation and accept it
      const invitation = await createInvitation({
        email: 'accepted@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      await acceptInvitation({
        token: invitation.token,
        name: 'Accepted User',
        password: 'password123'
      });

      // Create pending invitation
      await createInvitation({
        email: 'pending@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const result = await getPendingInvitations(organization.id);

      expect(result).toHaveLength(1);
      expect(result[0].email).toEqual('pending@test.com');
    });

    it('should not return expired invitations', async () => {
      const { organization, user } = await createTestData();
      
      // Create expired invitation
      await db.insert(invitationsTable)
        .values({
          email: 'expired@test.com',
          organization_id: organization.id,
          role: 'member',
          token: 'expired-token',
          expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          invited_by: user.id
        })
        .execute();

      // Create valid invitation
      await createInvitation({
        email: 'valid@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const result = await getPendingInvitations(organization.id);

      expect(result).toHaveLength(1);
      expect(result[0].email).toEqual('valid@test.com');
    });

    it('should return empty array when no pending invitations', async () => {
      const { organization } = await createTestData();
      
      const result = await getPendingInvitations(organization.id);
      expect(result).toHaveLength(0);
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke invitation successfully', async () => {
      const { organization, user } = await createTestData();
      
      const invitation = await createInvitation({
        email: 'revoked@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const result = await revokeInvitation(invitation.id);

      expect(result).toBe(true);

      // Verify invitation was deleted
      const invitations = await db.select()
        .from(invitationsTable)
        .where(eq(invitationsTable.id, invitation.id))
        .execute();

      expect(invitations).toHaveLength(0);
    });

    it('should throw error for non-existent invitation', async () => {
      await expect(revokeInvitation(99999)).rejects.toThrow(/invitation not found/i);
    });

    it('should throw error when trying to revoke accepted invitation', async () => {
      const { organization, user } = await createTestData();
      
      const invitation = await createInvitation({
        email: 'accepted@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      // Accept the invitation first
      await acceptInvitation({
        token: invitation.token,
        name: 'Accepted User',
        password: 'password123'
      });

      await expect(revokeInvitation(invitation.id)).rejects.toThrow(/cannot revoke.*already accepted/i);
    });
  });

  describe('resendInvitation', () => {
    it('should resend invitation with new token and expiration', async () => {
      const { organization, user } = await createTestData();
      
      const invitation = await createInvitation({
        email: 'resend@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const originalToken = invitation.token;
      const originalExpiration = invitation.expires_at;

      const result = await resendInvitation(invitation.id);

      expect(result.id).toEqual(invitation.id);
      expect(result.email).toEqual('resend@test.com');
      expect(result.token).not.toEqual(originalToken);
      expect(result.expires_at.getTime()).toBeGreaterThan(originalExpiration.getTime());
    });

    it('should throw error for non-existent invitation', async () => {
      await expect(resendInvitation(99999)).rejects.toThrow(/invitation not found/i);
    });

    it('should throw error when trying to resend accepted invitation', async () => {
      const { organization, user } = await createTestData();
      
      const invitation = await createInvitation({
        email: 'accepted@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      // Accept the invitation first
      await acceptInvitation({
        token: invitation.token,
        name: 'Accepted User',
        password: 'password123'
      });

      await expect(resendInvitation(invitation.id)).rejects.toThrow(/cannot resend.*already accepted/i);
    });

    it('should update database with new token and expiration', async () => {
      const { organization, user } = await createTestData();
      
      const invitation = await createInvitation({
        email: 'resend@test.com',
        organization_id: organization.id,
        role: 'member',
        invited_by: user.id
      });

      const result = await resendInvitation(invitation.id);

      // Verify database was updated
      const updatedInvitation = await db.select()
        .from(invitationsTable)
        .where(eq(invitationsTable.id, invitation.id))
        .execute();

      expect(updatedInvitation[0].token).toEqual(result.token);
      expect(updatedInvitation[0].expires_at.getTime()).toEqual(result.expires_at.getTime());
    });
  });
});