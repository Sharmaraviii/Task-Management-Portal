import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * ACCESS TOKEN
 * Short lived (15 minutes). Sent on every API request in the Authorization
 * header. Carries just enough claims that the common case — "who are you and
 * what role do you have" — needs no database round trip.
 *
 * It deliberately does NOT carry permissions, only identity + role. Fine
 * grained decisions ("does this manager own this team") are resolved against
 * live data in middleware, because a token minted 14 minutes ago cannot know
 * that the user was moved out of a team 2 minutes ago.
 */
export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      team: user.team ? user.team.toString() : null,
    },
    env.accessSecret,
    { expiresIn: env.accessTtl }
  );
}

/**
 * REFRESH TOKEN
 * Long lived (7 days), signed with a DIFFERENT secret so an access token
 * cannot be mistaken for a refresh token or vice versa. Its only power is to
 * be exchanged at POST /api/auth/refresh for a new access token.
 *
 * It carries tokenVersion so that logout (which increments the user's
 * version) invalidates it server side.
 */
export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), tokenVersion: user.tokenVersion },
    env.refreshSecret,
    { expiresIn: env.refreshTtl }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.accessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.refreshSecret);
}

/**
 * httpOnly: JavaScript in the page cannot read it, so an XSS bug cannot
 *           exfiltrate the long lived credential.
 * sameSite 'lax': the browser will not attach it to cross-site requests,
 *           which blocks the basic CSRF shape for this endpoint.
 * path: the cookie is only ever sent to the auth routes that need it.
 * secure: off in development because localhost is plain http; it would be on
 *           in any real deployment.
 */
export function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie('refreshToken', { path: '/api/auth' });
}
