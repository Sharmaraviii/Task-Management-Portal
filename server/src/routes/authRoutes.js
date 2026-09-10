import { Router } from 'express';
import { register, login, refresh, logout, me } from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Public: these are how you obtain a token in the first place.
router.post('/register', register);
router.post('/login', login);

// Public by design — it authenticates with the refresh cookie, not with an
// access token. Requiring a valid access token here would defeat the point,
// since the client calls it precisely because its access token expired.
router.post('/refresh', refresh);
router.post('/logout', logout);

// Requires a valid access token: it reports who the caller is.
router.get('/me', verifyToken, me);

export default router;
