import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, organizationsTable } from '../db/schema';
import { type RegisterInput, type LoginInput, type GoogleAuthInput } from '../schema';
import { register, login, googleAuth, verifyToken } from '../handlers/auth';
import { eq } from 'drizzle-orm';

// Test input data
const testRegisterInput: RegisterInput = {
  email: 'test@example.com',
  name: 'Test User',
  password: 'password123',
  organization_name: 'Test Organization'
};

const testLoginInput: LoginInput = {
  email: 'test@example.com',
  password: 'password123'
};

const testGoogleAuthInput: GoogleAuthInput = {
  google_id: 'google123456789',
  email: 'google@example.com',
  name: 'Google User',
  avatar_url: 'https://example.com/avatar.jpg'
};

describe('auth handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('register', () => {
    it('should create organization and admin user', async () => {
      const result = await register(testRegisterInput);

      // Validate response structure
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');

      // Validate user data
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.name).toBe('Test User');
      expect(result.user.role).toBe('admin');
      expect(result.user.auth_provider).toBe('email');
      expect(result.user.is_active).toBe(true);
      expect(result.user.id).toBeDefined();
      expect(result.user.organization_id).toBeDefined();
      expect(result.user.created_at).toBeInstanceOf(Date);
    });

    it('should create organization in database', async () => {
      const result = await register(testRegisterInput);

      const organizations = await db.select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, result.user.organization_id))
        .execute();

      expect(organizations).toHaveLength(1);
      expect(organizations[0].name).toBe('Test Organization');
      expect(organizations[0].slug).toBe('test-organization');
      expect(organizations[0].created_at).toBeInstanceOf(Date);
    });

    it('should hash password correctly', async () => {
      const result = await register(testRegisterInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.user.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].password_hash).toBeDefined();
      expect(users[0].password_hash).not.toBe('password123');
      
      // Verify password can be validated
      const isValid = await Bun.password.verify('password123', users[0].password_hash!);
      expect(isValid).toBe(true);
    });

    it('should generate valid JWT token', async () => {
      const result = await register(testRegisterInput);

      const decoded = JSON.parse(Buffer.from(result.token, 'base64').toString()) as { userId: number };
      expect(decoded.userId).toBe(result.user.id);
    });

    it('should handle organization slug generation', async () => {
      const input: RegisterInput = {
        email: 'test2@example.com',
        name: 'Test User 2',
        password: 'password123',
        organization_name: 'My Amazing Company! @#$'
      };

      const result = await register(input);

      const organizations = await db.select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, result.user.organization_id))
        .execute();

      expect(organizations[0].slug).toBe('my-amazing-company');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create a user for login tests
      await register(testRegisterInput);
    });

    it('should login with valid credentials', async () => {
      const result = await login(testLoginInput);

      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.name).toBe('Test User');
    });

    it('should generate valid JWT token on login', async () => {
      const result = await login(testLoginInput);

      const decoded = JSON.parse(Buffer.from(result.token, 'base64').toString()) as { userId: number };
      expect(decoded.userId).toBe(result.user.id);
    });

    it('should reject invalid email', async () => {
      const invalidInput: LoginInput = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      await expect(login(invalidInput)).rejects.toThrow(/invalid email or password/i);
    });

    it('should reject invalid password', async () => {
      const invalidInput: LoginInput = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      await expect(login(invalidInput)).rejects.toThrow(/invalid email or password/i);
    });

    it('should reject inactive user', async () => {
      // Deactivate the user
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.email, 'test@example.com'))
        .execute();

      await expect(login(testLoginInput)).rejects.toThrow(/account is deactivated/i);
    });

    it('should reject user without password hash', async () => {
      // Create organization first
      const org = await db.insert(organizationsTable)
        .values({
          name: 'Test Org',
          slug: 'test-org'
        })
        .returning()
        .execute();

      // Create Google user without password
      await db.insert(usersTable)
        .values({
          email: 'google-only@example.com',
          name: 'Google Only User',
          password_hash: null,
          role: 'member',
          organization_id: org[0].id,
          auth_provider: 'google',
          google_id: 'google123'
        })
        .execute();

      const loginAttempt: LoginInput = {
        email: 'google-only@example.com',
        password: 'anypassword'
      };

      await expect(login(loginAttempt)).rejects.toThrow(/invalid login method/i);
    });
  });

  describe('googleAuth', () => {
    let organizationId: number;

    beforeEach(async () => {
      // Create organization for tests
      const org = await db.insert(organizationsTable)
        .values({
          name: 'Test Org',
          slug: 'test-org'
        })
        .returning()
        .execute();
      
      organizationId = org[0].id;
    });

    it('should create and link Google user to existing email account', async () => {
      // Create existing user with email auth
      const existingUser = await db.insert(usersTable)
        .values({
          email: 'google@example.com',
          name: 'Existing User',
          password_hash: await Bun.password.hash('password123'),
          role: 'member',
          organization_id: organizationId,
          auth_provider: 'email'
        })
        .returning()
        .execute();

      const result = await googleAuth(testGoogleAuthInput);

      expect(result.user.id).toBe(existingUser[0].id);
      expect(result.user.google_id).toBe('google123456789');
      expect(result.user.auth_provider).toBe('google');
      expect(result.user.avatar_url).toBe('https://example.com/avatar.jpg');
    });

    it('should login existing Google user', async () => {
      // Create existing Google user
      const existingUser = await db.insert(usersTable)
        .values({
          email: 'google@example.com',
          name: 'Google User',
          password_hash: null,
          role: 'member',
          organization_id: organizationId,
          auth_provider: 'google',
          google_id: 'google123456789',
          avatar_url: 'https://old-avatar.jpg'
        })
        .returning()
        .execute();

      const result = await googleAuth(testGoogleAuthInput);

      expect(result.user.id).toBe(existingUser[0].id);
      expect(result.user.avatar_url).toBe('https://example.com/avatar.jpg');
      expect(result.token).toBeDefined();
    });

    it('should reject inactive Google user', async () => {
      // Create inactive Google user
      await db.insert(usersTable)
        .values({
          email: 'google@example.com',
          name: 'Google User',
          password_hash: null,
          role: 'member',
          organization_id: organizationId,
          auth_provider: 'google',
          google_id: 'google123456789',
          is_active: false
        })
        .execute();

      await expect(googleAuth(testGoogleAuthInput)).rejects.toThrow(/account is deactivated/i);
    });

    it('should reject new Google users without organization', async () => {
      const newGoogleInput: GoogleAuthInput = {
        google_id: 'new-google-user',
        email: 'new-google@example.com',
        name: 'New Google User'
      };

      await expect(googleAuth(newGoogleInput)).rejects.toThrow(/must be invited to an organization first/i);
    });
  });

  describe('verifyToken', () => {
    let validToken: string;
    let userId: number;

    beforeEach(async () => {
      const result = await register(testRegisterInput);
      validToken = result.token;
      userId = result.user.id;
    });

    it('should return user for valid token', async () => {
      const user = await verifyToken(validToken);

      expect(user.id).toBe(userId);
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.is_active).toBe(true);
    });

    it('should reject invalid token', async () => {
      const invalidToken = 'invalid.token.here';

      await expect(verifyToken(invalidToken)).rejects.toThrow();
    });

    it('should reject token for inactive user', async () => {
      // Deactivate the user
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.id, userId))
        .execute();

      await expect(verifyToken(validToken)).rejects.toThrow(/user not found or inactive/i);
    });

    it('should reject token for non-existent user', async () => {
      // Create token for non-existent user
      const fakePayload = { userId: 99999, exp: Date.now() + 24 * 60 * 60 * 1000 };
      const fakeToken = Buffer.from(JSON.stringify(fakePayload)).toString('base64');

      await expect(verifyToken(fakeToken)).rejects.toThrow(/user not found or inactive/i);
    });

    it('should reject expired token', async () => {
      // Create expired token (expired 1 second ago)
      const expiredPayload = { userId, exp: Date.now() - 1000 };
      const expiredToken = Buffer.from(JSON.stringify(expiredPayload)).toString('base64');

      await expect(verifyToken(expiredToken)).rejects.toThrow();
    });
  });
});