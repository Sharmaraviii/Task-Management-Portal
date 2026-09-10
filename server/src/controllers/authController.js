import { User } from '../models/User.js';
import { ROLES } from '../config/env.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
} from '../utils/tokens.js';
import { asyncHandler, badRequest, conflict, unauthorized } from '../utils/httpError.js';

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  team: user.team,
  isActive: user.isActive,
});

/**
 * POST /api/auth/register
 * Self-registration always creates an EMPLOYEE with no team. Role is read
 * from the server's own default, never from the request body — otherwise
 * anyone could POST {"role":"ADMIN"} and privilege-escalate at signup. Only
 * an authenticated admin can mint elevated accounts (see userController).
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) throw badRequest('name, email and password are required');
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw conflict('Email already registered');

  const user = new User({ name, email, role: ROLES.EMPLOYEE });
  await user.setPassword(password);
  await user.save();

  res.status(201).json({ user: publicUser(user) });
});

/**
 * POST /api/auth/login
 * Issues the pair. The access token goes in the JSON body (the client keeps
 * it in memory); the refresh token goes into an httpOnly cookie the client's
 * JavaScript can never read.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw badRequest('email and password are required');

  // The only place in the codebase that pulls the hash out of the database.
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  // Identical message for "no such user" and "wrong password", so the
  // endpoint cannot be used to enumerate which emails have accounts.
  if (!user || !(await user.verifyPassword(password))) {
    throw unauthorized('Invalid credentials');
  }
  if (!user.isActive) throw unauthorized('Account is deactivated');

  setRefreshCookie(res, signRefreshToken(user));
  res.json({ accessToken: signAccessToken(user), user: publicUser(user) });
});

/**
 * POST /api/auth/refresh
 * The client's axios interceptor calls this after a 401 and then replays the
 * original request. Rotates the refresh token on every use.
 */
export const refresh = asyncHandler(async (req, res) => {
  // Cookie first; the body fallback exists only so the API can be exercised
  // from curl or Postman during a demo.
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) throw unauthorized('No refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw unauthorized('User is not active');

  // The stateless-logout check: logout bumps tokenVersion, which strands
  // every refresh token minted before it.
  if (payload.tokenVersion !== user.tokenVersion) {
    throw unauthorized('Refresh token has been revoked');
  }

  // Rotation — a refreshed session gets a fresh 7 day window and the old
  // cookie value stops being the current one.
  setRefreshCookie(res, signRefreshToken(user));
  res.json({ accessToken: signAccessToken(user), user: publicUser(user) });
});

/**
 * POST /api/auth/logout
 * Clearing the cookie alone would only log out this browser, and would do
 * nothing about a token already copied elsewhere. Incrementing tokenVersion
 * revokes every outstanding refresh token for the account server-side.
 * Access tokens already issued still work until they expire — that is the
 * accepted trade-off of stateless auth, and the 15 minute lifetime is what
 * bounds it.
 */
export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.findByIdAndUpdate(payload.sub, { $inc: { tokenVersion: 1 } });
    } catch {
      /* already invalid — clearing the cookie is still the right response */
    }
  }
  clearRefreshCookie(res);
  res.json({ ok: true });
});

/** GET /api/auth/me — lets the client rehydrate its user on a page refresh. */
export const me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
});
