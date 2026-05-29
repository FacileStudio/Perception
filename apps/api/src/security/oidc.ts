import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config';
import { getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';

const OIDC_STATE_COOKIE = 'perception_oidc_state';
const OIDC_STATE_TTL = 10 * 60;

interface OIDCDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

let discovery: OIDCDiscovery | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function getDiscovery(): Promise<OIDCDiscovery> {
  if (discovery) return discovery;
  const issuer = config.oidcIssuer.replace(/\/$/, '');
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  discovery = await res.json() as OIDCDiscovery;
  return discovery;
}

async function getJWKS(): Promise<ReturnType<typeof createRemoteJWKSet>> {
  if (jwks) return jwks;
  const d = await getDiscovery();
  jwks = createRemoteJWKSet(new URL(d.jwks_uri));
  return jwks;
}

export function isOIDCEnabled(): boolean {
  return !!(config.oidcIssuer && config.oidcClientId && config.oidcClientSecret && config.oidcRedirectUrl);
}

export async function initiateOIDCLogin(c: Context): Promise<Response> {
  const d = await getDiscovery();
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  setCookie(c, OIDC_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: OIDC_STATE_TTL,
  });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.oidcClientId,
    redirect_uri: config.oidcRedirectUrl,
    scope: 'openid email profile',
    state,
  });
  return c.redirect(`${d.authorization_endpoint}?${params.toString()}`);
}

export async function handleOIDCCallback(c: Context): Promise<{ email: string; name?: string; picture?: string }> {
  const stateCookie = getCookie(c, OIDC_STATE_COOKIE);
  const { code, state } = c.req.query() as { code?: string; state?: string };

  if (!stateCookie || !state || stateCookie !== state) {
    throw new Error('invalid_state');
  }
  setCookie(c, OIDC_STATE_COOKIE, '', { path: '/', maxAge: -1 });

  if (!code) throw new Error('missing_code');

  const d = await getDiscovery();
  const tokenRes = await fetch(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.oidcRedirectUrl,
      client_id: config.oidcClientId,
      client_secret: config.oidcClientSecret,
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`token_exchange_failed: ${err}`);
  }
  const tokens = await tokenRes.json() as { id_token?: string };
  if (!tokens.id_token) throw new Error('missing_id_token');

  const jwksSet = await getJWKS();
  const { payload } = await jwtVerify(tokens.id_token, jwksSet, {
    issuer: d.issuer,
    audience: config.oidcClientId,
  });

  const email = payload.email as string | undefined;
  if (!email) throw new Error('no_email_in_claims');

  const name = (payload.name as string | undefined) ?? (payload.preferred_username as string | undefined);
  const picture = payload.picture as string | undefined;
  return { email, name, picture };
}
