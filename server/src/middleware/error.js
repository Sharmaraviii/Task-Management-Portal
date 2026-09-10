import { HttpError } from '../utils/httpError.js';

// eslint-disable-next-line no-unused-vars -- Express identifies error
// middleware by its four-argument signature, so `next` must stay.
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message,
      details: err.details,
    });
  }

  // Mongoose validation / cast failures are the client's fault, not ours.
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path}` });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value', details: err.keyValue });
  }

  console.error(err);
  // Never echo an unexpected error's message to the client — stack traces
  // and driver errors leak schema and file-system detail.
  return res.status(500).json({ error: 'Internal server error' });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}
