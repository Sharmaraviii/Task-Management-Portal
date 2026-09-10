import { Link } from 'react-router-dom';

export const StatusBadge = ({ status }) => (
  <span className={`badge status-${status}`}>{status.replace('_', ' ')}</span>
);

export const PriorityDot = ({ priority }) => (
  <span className={`pdot p-${priority}`} title={`${priority} priority`} />
);

export const ErrorNote = ({ children }) =>
  children ? <div className="note error">{children}</div> : null;

export const Empty = ({ children }) => <div className="empty muted">{children}</div>;

export function ProgressBar({ counts, total }) {
  const pct = (n) => (total ? (n / total) * 100 : 0);
  return (
    <div className="progress" role="img" aria-label={`${counts.DONE} of ${total} done`}>
      <div className="seg s-DONE" style={{ width: `${pct(counts.DONE)}%` }} />
      <div className="seg s-IN_PROGRESS" style={{ width: `${pct(counts.IN_PROGRESS)}%` }} />
      <div className="seg s-TODO" style={{ width: `${pct(counts.TODO)}%` }} />
    </div>
  );
}

const isOverdue = (t) => t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < new Date();

export function TaskRow({ task, showAssignee }) {
  return (
    <Link to={`/tasks/${task._id}`} className="taskrow">
      <PriorityDot priority={task.priority} />
      <div className="taskrow-main">
        <div className="taskrow-title">{task.title}</div>
        <div className="taskrow-meta muted">
          {showAssignee && task.assignee?.name ? `${task.assignee.name} · ` : ''}
          {task.team?.name ? `${task.team.name} · ` : ''}
          {task.dueDate ? (
            <span className={isOverdue(task) ? 'overdue' : ''}>
              due {new Date(task.dueDate).toLocaleDateString()}
            </span>
          ) : (
            'no due date'
          )}
        </div>
      </div>
      <StatusBadge status={task.status} />
    </Link>
  );
}
