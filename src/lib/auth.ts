import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from './db';
import * as authSchema from './auth-schema';

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
    }
  }
});
