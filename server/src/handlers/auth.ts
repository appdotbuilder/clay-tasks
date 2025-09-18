import { db } from '../db';
import { usersTable, organizationsTable } from '../db/schema';
import { type RegisterInput, type LoginInput, type GoogleAuthInput, type User } from '../schema';
import { eq, and } from 'drizzle-orm';
const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';

// Helper function to generate JWT token (simple base64 encoding for this demo)
const generateToken = (userId: number): string => {
  const payload = {
    userId,
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours from now
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
};

// Helper function to generate organization slug from name
const generateSlug = (name: string): string => {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, '') // Remove leading and trailing hyphens
    .trim();
};

// Auth handler for email/password registration
export async function register(input: RegisterInput): Promise<{ user: User; token: string }> {
  try {
    // Hash the password
    const password_hash = await Bun.password.hash(input.password);

    // Generate organization slug
    const organizationSlug = generateSlug(input.organization_name);

    // Create organization first
    const organizationResult = await db.insert(organizationsTable)
      .values({
        name: input.organization_name,
        slug: organizationSlug
      })
      .returning()
      .execute();

    const organization = organizationResult[0];

    // Create user with admin role for the new organization
    const userResult = await db.insert(usersTable)
      .values({
        email: input.email,
        name: input.name,
        password_hash,
        role: 'admin',
        organization_id: organization.id,
        auth_provider: 'email'
      })
      .returning()
      .execute();

    const user = userResult[0];

    // Generate JWT token
    const token = generateToken(user.id);

    return {
      user,
      token
    };
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
}

// Auth handler for email/password login
export async function login(input: LoginInput): Promise<{ user: User; token: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    // Verify password hash
    if (!user.password_hash) {
      throw new Error('Invalid login method for this account');
    }

    const isValidPassword = await Bun.password.verify(input.password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = generateToken(user.id);

    return {
      user,
      token
    };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

// Auth handler for Google OAuth
export async function googleAuth(input: GoogleAuthInput): Promise<{ user: User; token: string }> {
  try {
    // Try to find existing user by Google ID
    let users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.google_id, input.google_id))
      .execute();

    let user: User;

    if (users.length > 0) {
      // User exists, update their info if needed
      user = users[0];

      // Check if user is active
      if (!user.is_active) {
        throw new Error('Account is deactivated');
      }

      // Update user info if changed
      if (user.email !== input.email || user.name !== input.name || user.avatar_url !== input.avatar_url) {
        const updateResult = await db.update(usersTable)
          .set({
            email: input.email,
            name: input.name,
            avatar_url: input.avatar_url || null,
            updated_at: new Date()
          })
          .where(eq(usersTable.id, user.id))
          .returning()
          .execute();

        user = updateResult[0];
      }
    } else {
      // Check if a user with this email already exists (different auth provider)
      const emailUsers = await db.select()
        .from(usersTable)
        .where(eq(usersTable.email, input.email))
        .execute();

      if (emailUsers.length > 0) {
        // Link Google account to existing user
        const updateResult = await db.update(usersTable)
          .set({
            google_id: input.google_id,
            auth_provider: 'google',
            avatar_url: input.avatar_url || null,
            updated_at: new Date()
          })
          .where(eq(usersTable.email, input.email))
          .returning()
          .execute();

        user = updateResult[0];
      } else {
        // Create new user - they need to be assigned to an organization later
        // For now, we'll create a default organization or require organization assignment
        throw new Error('New Google users must be invited to an organization first');
      }
    }

    // Generate JWT token
    const token = generateToken(user.id);

    return {
      user,
      token
    };
  } catch (error) {
    console.error('Google auth failed:', error);
    throw error;
  }
}

// Verify JWT token and return user
export async function verifyToken(token: string): Promise<User> {
  try {
    // Verify token (simple base64 decoding for this demo)
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString()) as { userId: number; exp: number };
    
    // Check if token is expired
    if (decoded.exp < Date.now()) {
      throw new Error('Token expired');
    }

    // Get user data
    const users = await db.select()
      .from(usersTable)
      .where(and(
        eq(usersTable.id, decoded.userId),
        eq(usersTable.is_active, true)
      ))
      .execute();

    if (users.length === 0) {
      throw new Error('User not found or inactive');
    }

    return users[0];
  } catch (error) {
    console.error('Token verification failed:', error);
    throw error;
  }
}