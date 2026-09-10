import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorNote, StatusBadge, Empty } from '../components/ui.jsx';

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

export default function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get(`/tasks/${id}`);
    setTask(data.task);
  }, [id]);

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err)));
  }, [load]);

  // Mirrors the server's rule, purely so the UI is not misleading. The
  // server decides for real: an employee who forces this true still gets 403
  // from requireTaskWrite.
  const canEditDetails = user.role === 'ADMIN' || user.role === 'MANAGER';

  const setStatus = async (status) => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/tasks/${id}/status`, { status });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/tasks/${id}/comments`, { body: comment });
      setComment('');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this task permanently?')) return;
    try {
      await api.delete(`/tasks/${id}`);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (error && !task) {
    return (
      <div className="card centered stack">
        <h2>Cannot open this task</h2>
        <p className="muted">{error}</p>
        <Link className="btn ghost" to="/">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!task) return <div className="centered muted">Loading…</div>;

  return (
    <div className="stack narrow">
      <Link className="muted small" to="/">
        ← Back
      </Link>

      <div className="card stack">
        <div className="row spread">
          <h1>{task.title}</h1>
          <StatusBadge status={task.status} />
        </div>

        <p>{task.description || <span className="muted">No description.</span>}</p>

        <div className="meta-grid muted small">
          <div>
            <span>Assignee</span>
            <strong>{task.assignee?.name}</strong>
          </div>
          <div>
            <span>Team</span>
            <strong>{task.team?.name}</strong>
          </div>
          <div>
            <span>Priority</span>
            <strong>{task.priority}</strong>
          </div>
          <div>
            <span>Due</span>
            <strong>
              {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
            </strong>
          </div>
          <div>
            <span>Created by</span>
            <strong>{task.createdBy?.name}</strong>
          </div>
        </div>

        <ErrorNote>{error}</ErrorNote>

        <div className="row gap wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              disabled={busy || s === task.status}
              className={`chip ${s === task.status ? 'on' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
          {canEditDetails && (
            <button className="btn ghost small danger" onClick={remove}>
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="card stack">
        <div className="card-head">Comments</div>
        {task.comments.length === 0 ? (
          <Empty>No comments yet.</Empty>
        ) : (
          task.comments.map((c) => (
            <div key={c._id} className="comment">
              <div className="row gap">
                <strong>{c.author?.name || 'Unknown'}</strong>
                <span className="muted small">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <p>{c.body}</p>
            </div>
          ))
        )}

        <form className="row gap" onSubmit={addComment}>
          <input
            className="grow"
            placeholder="Add a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn primary" disabled={busy || !comment.trim()}>
            Post
          </button>
        </form>
      </div>
    </div>
  );
}
