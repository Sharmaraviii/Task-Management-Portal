/**
 * One error shape for the whole API. Handlers throw these, the error
 * middleware turns them into a JSON response. This keeps status-code
 * decisions next to the logic that made them instead of scattered
 * res.status(...).json(...) calls.
 */
export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Not authenticated') => new HttpError(401, msg);
export const forbidden = (msg = 'Not permitted') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/**
 * Express 4 does not catch rejected promises from async handlers, so an
 * await that throws would hang the request. Wrapping every async handler
 * routes those rejections into next() and therefore into the error
 * middleware.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
