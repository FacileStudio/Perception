import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { config } from './config';

export const auth = betterAuth({
  basePath: '/auth',
  secret: config.sessionSecret || config.adminPassword || 'perception-dev-secret-change-me',
  baseURL: `http://localhost:${config.port}`,
  database: {
    dialect: new LibsqlDialect({
      url: config.databaseUrl,
      authToken: config.databaseAuthToken || undefined,
    }),
    type: 'sqlite' as const,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  user: {
    additionalFields: {
      color: {
        type: 'string',
        required: false,
        defaultValue: '#818cf8',
        input: false,
      },
    },
  },
  advanced: {
    generateId: () => crypto.randomUUID(),
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: !config.localDevAuthDisabled,
      httpOnly: true,
      path: '/',
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
      creatorRole: 'owner',
      membershipLimit: 50,
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
