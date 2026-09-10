import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Denormalised membership list. The authoritative link is User.team;
    // this array exists so the ownership middleware can answer "is this user
    // in this team" without a second query on every request.
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

/*
 * INDEX: { name: 1 } unique
 * Serves: uniqueness of team names and Team.findOne({ name }) in the seed
 * script. Cheap to maintain — teams are created rarely and read often.
 */
teamSchema.index({ name: 1 }, { unique: true });

/*
 * INDEX: { manager: 1 }
 * Serves: Team.find({ manager: req.user.id }) — run by the resource-scoped
 * authorisation middleware on effectively every manager request, to work out
 * which teams that manager owns. This is the hottest lookup in the
 * authorisation path, so it must not be a collection scan.
 */
teamSchema.index({ manager: 1 });

teamSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const Team = mongoose.model('Team', teamSchema);
