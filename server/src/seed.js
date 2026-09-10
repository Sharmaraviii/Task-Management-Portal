/**
 * Seed script — `npm run seed`.
 *
 * Wipes the three collections and rebuilds a small, deterministic dataset so
 * the app is demoable the moment it starts: 1 admin, 2 managers, 5
 * employees, 2 teams, 20 tasks spread across statuses, priorities and due
 * dates (some deliberately overdue, so the dashboard has something to show).
 *
 * Every account uses SEED_PASSWORD from .env, and passwords go through the
 * same setPassword() model method the real registration path uses — the seed
 * never writes a hash by hand.
 */
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { env, ROLES, TASK_STATUS, TASK_PRIORITY } from './config/env.js';
import { User } from './models/User.js';
import { Team } from './models/Team.js';
import { Task } from './models/Task.js';

const PASSWORD = env.seedPassword;

async function makeUser(name, email, role, team = null) {
  const user = new User({ name, email, role, team });
  await user.setPassword(PASSWORD);
  await user.save();
  return user;
}

// Offset from today in days -> Date. Negative values are overdue.
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

export async function seed({ manageConnection = true } = {}) {
  if (manageConnection) await mongoose.connect(env.mongoUri);
  console.log('Connected. Clearing existing data…');
  await Promise.all([User.deleteMany({}), Team.deleteMany({}), Task.deleteMany({})]);

  // --- people ---------------------------------------------------------
  const admin = await makeUser('Ada Admin', 'admin@portal.dev', ROLES.ADMIN);
  const maya = await makeUser('Maya Manager', 'maya@portal.dev', ROLES.MANAGER);
  const marc = await makeUser('Marc Manager', 'marc@portal.dev', ROLES.MANAGER);

  const employees = await Promise.all([
    makeUser('Elena Employee', 'elena@portal.dev', ROLES.EMPLOYEE),
    makeUser('Ethan Employee', 'ethan@portal.dev', ROLES.EMPLOYEE),
    makeUser('Emma Employee', 'emma@portal.dev', ROLES.EMPLOYEE),
    makeUser('Elijah Employee', 'elijah@portal.dev', ROLES.EMPLOYEE),
    makeUser('Eva Employee', 'eva@portal.dev', ROLES.EMPLOYEE),
  ]);

  // --- teams ----------------------------------------------------------
  // Platform: Maya + 3 employees. Design: Marc + 2 employees.
  const platformMembers = employees.slice(0, 3);
  const designMembers = employees.slice(3);

  const platform = await Team.create({
    name: 'Platform',
    manager: maya._id,
    members: platformMembers.map((u) => u._id),
  });
  const design = await Team.create({
    name: 'Design',
    manager: marc._id,
    members: designMembers.map((u) => u._id),
  });

  // Both sides of the relationship, exactly as the API routes do it.
  await User.updateMany(
    { _id: { $in: platformMembers.map((u) => u._id) } },
    { $set: { team: platform._id } }
  );
  await User.updateMany(
    { _id: { $in: designMembers.map((u) => u._id) } },
    { $set: { team: design._id } }
  );
  await User.findByIdAndUpdate(maya._id, { team: platform._id });
  await User.findByIdAndUpdate(marc._id, { team: design._id });

  // --- tasks ----------------------------------------------------------
  const { TODO, IN_PROGRESS, DONE } = TASK_STATUS;
  const { LOW, MEDIUM, HIGH } = TASK_PRIORITY;

  const platformTitles = [
    ['Set up MongoDB connection pooling', IN_PROGRESS, HIGH, 3],
    ['Add compound index on tasks collection', DONE, HIGH, -5],
    ['Write refresh-token rotation logic', IN_PROGRESS, HIGH, 1],
    ['Harden CORS configuration', TODO, MEDIUM, 7],
    ['Migrate seed script to ES modules', DONE, LOW, -12],
    ['Investigate slow team-progress query', TODO, HIGH, -2],
    ['Document environment variables', TODO, LOW, 14],
    ['Add soft-delete for users', IN_PROGRESS, MEDIUM, 5],
    ['Split auth middleware into three units', DONE, MEDIUM, -8],
    ['Return 403 on cross-team task access', DONE, HIGH, -3],
    ['Cache managed-team lookups per request', TODO, LOW, 21],
    ['Review error-handler leakage', TODO, MEDIUM, 9],
  ];

  const designTitles = [
    ['Design the login screen', DONE, HIGH, -10],
    ['Build the role-conditional dashboard shell', IN_PROGRESS, HIGH, 2],
    ['Pick a colour palette for status badges', DONE, LOW, -6],
    ['Make the task board responsive', TODO, MEDIUM, 8],
    ['Empty-state illustrations for zero tasks', TODO, LOW, 16],
    ['Accessible focus styles for all buttons', IN_PROGRESS, MEDIUM, 4],
    ['Progress bar for team completion rate', TODO, HIGH, -1],
    ['Comment thread visual hierarchy', TODO, MEDIUM, 11],
  ];

  const rows = [
    ...platformTitles.map((t, i) => ({
      row: t,
      team: platform._id,
      assignee: platformMembers[i % platformMembers.length]._id,
      createdBy: maya._id,
    })),
    ...designTitles.map((t, i) => ({
      row: t,
      team: design._id,
      assignee: designMembers[i % designMembers.length]._id,
      createdBy: marc._id,
    })),
  ];

  const tasks = await Task.insertMany(
    rows.map(({ row: [title, status, priority, due], team, assignee, createdBy }) => ({
      title,
      description: `${title}. Seeded task for demonstration purposes.`,
      assignee,
      team,
      status,
      priority,
      dueDate: daysFromNow(due),
      createdBy,
    }))
  );

  // A couple of comment threads so the detail view is not empty.
  await Task.findByIdAndUpdate(tasks[0]._id, {
    $push: {
      comments: {
        $each: [
          { author: platformMembers[0]._id, body: 'Started on this — pool size looks low.' },
          { author: maya._id, body: 'Agreed, try 10 and measure under load.' },
        ],
      },
    },
  });
  await Task.findByIdAndUpdate(tasks[12]._id, {
    $push: { comments: { author: marc._id, body: 'Looks good. Ship it.' } },
  });

  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));

  console.log(`
Seed complete.
  users : ${await User.countDocuments()}   (1 admin, 2 managers, 5 employees)
  teams : ${await Team.countDocuments()}   (Platform, Design)
  tasks : ${await Task.countDocuments()}

Log in with any of these — password: ${PASSWORD}
  admin@portal.dev    ADMIN
  maya@portal.dev     MANAGER  (Platform)
  marc@portal.dev     MANAGER  (Design)
  elena@portal.dev    EMPLOYEE (Platform)
  eva@portal.dev      EMPLOYEE (Design)
`);

  if (manageConnection) await mongoose.disconnect();
}

// Only self-execute when run directly (`npm run seed`), so that the
// in-memory dev server can import and call seed() itself.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed().catch(async (err) => {
    console.error('Seed failed:', err);
    await mongoose.disconnect();
    process.exit(1);
  });
}
