import { config } from './config';

let _auth: any = null;
let _authError: string | null = null;

function getAuth() {
  if (_auth) return _auth;
  if (_authError) throw new Error(_authError);

  try {
    const { betterAuth } = require('better-auth');
    const { organization } = require('better-auth/plugins');
    const { LibsqlDialect } = require('@libsql/kysely-libsql');

    _auth = betterAuth({
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

    console.log('[auth] Better Auth initialized');
    return _auth;
  } catch (e) {
    _authError = e instanceof Error ? e.message : String(e);
    console.error('[auth] Better Auth failed to initialize:', _authError);
    throw e;
  }
}

export const auth = {
  get handler() {
    return getAuth().handler;
  },
  get api() {
    return getAuth().api;
  },
};

export function getAuthError(): string | null {
  return _authError;
}

export type Session = any;
