import { Request, Response, NextFunction } from 'express';

type ErrorWithStatus = Error & { status?: number; statusCode?: number };

const statusToCode = (status: number): string => {
  if (status === 400) return 'INVALID_PARAMETER';
  if (status === 404) return 'NOT_FOUND';
  return 'INTERNAL_ERROR';
};

export const errorHandler = (err: ErrorWithStatus,_req: Request,res: Response,_next: NextFunction) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  const status = err.status || err.statusCode || 500;
  const code = statusToCode(status);

  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message || 'Something went wrong',
    code,
  });
};