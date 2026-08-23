import morgan from 'morgan';

export const logger = morgan(
  process.env.NODE_ENV === 'production'
    ? ':method :url :status :response-time ms'
    : 'dev'
);
