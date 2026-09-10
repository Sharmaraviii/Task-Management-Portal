import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../config/env.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    // Named passwordHash, not password, so it is obvious at every call site
    // that this field is never a plaintext value.
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.EMPLOYEE,
      required: true,
    },
    // An ADMIN belongs to no team; MANAGER/EMPLOYEE belong to exactly one.
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    isActive: { type: Boolean, default: true },
    /**
     * Incremented on logout and on deactivation. Every refresh token carries
     * the version it was minted with, so bumping this number invalidates all
     * outstanding refresh tokens for the user without needing a database of
     * issued tokens or a blocklist. This is what makes logout actually mean
     * something for a stateless token scheme.
     */
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/*
 * INDEX: { email: 1 } unique
 * Serves: User.findOne({ email }) on every login, and enforces one account
 * per address. Without it login degrades to a full collection scan, and two
 * concurrent registrations could both pass an application-level "does this
 * email exist" check and create duplicates. The unique index makes the
 * database the single arbiter of that invariant.
 */
userSchema.index({ email: 1 }, { unique: true });

/*
 * INDEX: { team: 1, isActive: 1 }
 * Serves: User.find({ team: <teamId>, isActive: true }) — the manager's
 * "who can I assign this task to" list and the admin's team roster view.
 * team is first because it is the equality field with the highest
 * selectivity; isActive then filters within that team using the same index,
 * so Mongo never has to fetch and discard deactivated members.
 */
userSchema.index({ team: 1, isActive: 1 });

/**
 * Hashing lives on the model, not in the auth controller, so that every
 * write path (register, seed script, admin-created users) gets the same
 * treatment. bcrypt with cost 10 — deliberately slow, so an attacker with a
 * stolen dump cannot test candidate passwords at speed.
 */
userSchema.methods.setPassword = async function setPassword(plaintext) {
  this.passwordHash = await bcrypt.hash(plaintext, 10);
};

userSchema.methods.verifyPassword = function verifyPassword(plaintext) {
  return bcrypt.compare(plaintext, this.passwordHash);
};

/**
 * Defence in depth against leaking the hash. `select: false` already keeps
 * passwordHash out of query results unless explicitly asked for, and this
 * strips it again whenever a document is serialised to JSON.
 */
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
