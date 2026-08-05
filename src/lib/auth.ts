import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import { db } from './db';
import * as authSchema from './auth-schema';
import { user as userTable } from './auth-schema';

// Origins trusted by Better Auth for CORS / Origin checks on /api/auth/*.
// Falls back to localhost for dev; in production set BETTER_AUTH_URL to the
// public URL (only that origin is trusted). Add extra domains via
// BETTER_AUTH_TRUSTED_ORIGINS (comma-separated).
const trustedOrigins = [
  process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((s) => s.trim()) ?? [])
].filter(Boolean);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
    usePlural: false
  }),
  emailAndPassword: {
    enabled: true
  },
  trustedOrigins,
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // New registrations default to master account + Owner role
          return {
            data: {
              ...user,
              ownerId: null,
              roleId: 'owner'
            }
          };
        }
      }
    },
    session: {
      create: {
        // Block sign-in for disabled accounts. Runs after credential
        // verification succeeds, right before the session row is inserted.
        // Throwing APIError here propagates to the client as result.error
        // (same mechanism better-auth uses for bad-password / unverified-email).
        before: async (session) => {
          const [u] = await db
            .select({ enabled: userTable.enabled })
            .from(userTable)
            .where(eq(userTable.id, session.userId))
            .limit(1);
          if (u && !u.enabled) {
            // Stable sentinel string; the sign-in page maps it to a translated message.
            throw new APIError('FORBIDDEN', { message: 'ACCOUNT_DISABLED' });
          }
        }
      }
    }
  }
});
