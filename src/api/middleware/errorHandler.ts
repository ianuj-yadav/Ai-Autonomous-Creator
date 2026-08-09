/**
 * Error handler middleware — catches all unhandled errors and returns
 * a structured JSON response matching the API spec error shape.
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../../logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'internal_error';

  logger.error({ err, statusCode, code }, 'Request error');

  res.status(statusCode).json({
    error: code,
    message: err.message ?? 'An unexpected error occurred',
  });
}

/** Helper to create a typed API error */
export function createError(message: string, statusCode: number, code: string): ApiError {
  const err = new Error(message) as ApiError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
