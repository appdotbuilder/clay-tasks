import { db } from '../db';
import { invitationsTable, usersTable } from '../db/schema';
import { type CreateInvitationInput, type AcceptInvitationInput, type Invitation, type User } from '../schema';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
// Note: bcrypt operations are simplified for this implementation
// In a real application, you would use a proper bcrypt library

// Generate a unique invitation token
function generateInvitationToken(): string {
  return randomBytes(32).toString('hex');
}

// Create a new invitation
export async function createInvitation(input: CreateInvitationInput): Promise<Invitation> {
  try {
    // Check if email is already registered in the organization
    const existingUser = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.email, input.email),
          eq(usersTable.organization_id, input.organization_id)
        )
      )
      .execute();

    if (existingUser.length > 0) {
      throw new Error('User with this email is already a member of this organization');
    }

    // Check if there's already a pending invitation for this email in this organization
    const existingInvitation = await db.select()
      .from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.email, input.email),
          eq(invitationsTable.organization_id, input.organization_id),
          isNull(invitationsTable.accepted_at),
          gt(invitationsTable.expires_at, new Date())
        )
      )
      .execute();

    if (existingInvitation.length > 0) {
      throw new Error('A pending invitation already exists for this email');
    }

    // Generate unique token and set expiration (7 days from now)
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create invitation record
    const result = await db.insert(invitationsTable)
      .values({
        email: input.email,
        organization_id: input.organization_id,
        role: input.role,
        token: token,
        expires_at: expiresAt,
        invited_by: input.invited_by
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Invitation creation failed:', error);
    throw error;
  }
}

// Accept an invitation
export async function acceptInvitation(input: AcceptInvitationInput): Promise<{ user: User; token: string }> {
  try {
    // Find invitation by token
    const invitations = await db.select()
      .from(invitationsTable)
      .where(eq(invitationsTable.token, input.token))
      .execute();

    if (invitations.length === 0) {
      throw new Error('Invalid invitation token');
    }

    const invitation = invitations[0];

    // Check if invitation is valid and not expired
    if (invitation.accepted_at !== null) {
      throw new Error('Invitation has already been accepted');
    }

    if (invitation.expires_at < new Date()) {
      throw new Error('Invitation has expired');
    }

    // Check if email is already registered in the organization
    const existingUser = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.email, invitation.email),
          eq(usersTable.organization_id, invitation.organization_id)
        )
      )
      .execute();

    if (existingUser.length > 0) {
      throw new Error('User with this email is already a member of this organization');
    }

    // Hash the password (simplified implementation)
    const passwordHash = `hashed_${input.password}_${Date.now()}`;

    // Create new user with role from invitation
    const userResult = await db.insert(usersTable)
      .values({
        email: invitation.email,
        name: input.name,
        password_hash: passwordHash,
        role: invitation.role,
        organization_id: invitation.organization_id,
        auth_provider: 'email'
      })
      .returning()
      .execute();

    const newUser = userResult[0];

    // Mark invitation as accepted
    await db.update(invitationsTable)
      .set({
        accepted_at: new Date()
      })
      .where(eq(invitationsTable.id, invitation.id))
      .execute();

    // Generate JWT token (simplified placeholder)
    const jwtToken = `jwt-token-${newUser.id}-${Date.now()}`;

    return {
      user: newUser,
      token: jwtToken
    };
  } catch (error) {
    console.error('Invitation acceptance failed:', error);
    throw error;
  }
}

// Get invitation by token
export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  try {
    const invitations = await db.select()
      .from(invitationsTable)
      .where(eq(invitationsTable.token, token))
      .execute();

    if (invitations.length === 0) {
      return null;
    }

    const invitation = invitations[0];

    // Check if invitation is valid and not expired
    if (invitation.accepted_at !== null || invitation.expires_at < new Date()) {
      return null;
    }

    return invitation;
  } catch (error) {
    console.error('Get invitation by token failed:', error);
    throw error;
  }
}

// Get all pending invitations for an organization
export async function getPendingInvitations(organizationId: number): Promise<Invitation[]> {
  try {
    const invitations = await db.select()
      .from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.organization_id, organizationId),
          isNull(invitationsTable.accepted_at),
          gt(invitationsTable.expires_at, new Date())
        )
      )
      .execute();

    return invitations;
  } catch (error) {
    console.error('Get pending invitations failed:', error);
    throw error;
  }
}

// Cancel/revoke an invitation
export async function revokeInvitation(id: number): Promise<boolean> {
  try {
    // Find invitation by ID to ensure it exists and is pending
    const invitations = await db.select()
      .from(invitationsTable)
      .where(eq(invitationsTable.id, id))
      .execute();

    if (invitations.length === 0) {
      throw new Error('Invitation not found');
    }

    const invitation = invitations[0];

    if (invitation.accepted_at !== null) {
      throw new Error('Cannot revoke an already accepted invitation');
    }

    // Delete the invitation
    const result = await db.delete(invitationsTable)
      .where(eq(invitationsTable.id, id))
      .execute();

    return (result.rowCount || 0) > 0;
  } catch (error) {
    console.error('Invitation revocation failed:', error);
    throw error;
  }
}

// Resend an invitation email
export async function resendInvitation(id: number): Promise<Invitation> {
  try {
    // Find invitation by ID
    const invitations = await db.select()
      .from(invitationsTable)
      .where(eq(invitationsTable.id, id))
      .execute();

    if (invitations.length === 0) {
      throw new Error('Invitation not found');
    }

    const invitation = invitations[0];

    // Check if invitation is still pending
    if (invitation.accepted_at !== null) {
      throw new Error('Cannot resend an already accepted invitation');
    }

    // Generate new token and update expiration date
    const newToken = generateInvitationToken();
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Update invitation with new token and expiration
    const result = await db.update(invitationsTable)
      .set({
        token: newToken,
        expires_at: newExpiresAt
      })
      .where(eq(invitationsTable.id, id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Invitation resend failed:', error);
    throw error;
  }
}