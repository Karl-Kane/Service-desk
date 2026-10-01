/**
 * Единый формат ошибок — RFC 9457 "Problem Details for HTTP APIs".
 * Бизнес-код бросает AppError, а setErrorHandler (plugins/error-handler.ts) превращает
 * его в ответ `application/problem+json`. Ни один роут не формирует тело ошибки сам.
 */

export interface ProblemFieldError {
  field: string;
  message: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: ProblemFieldError[];
}

const TYPE_BASE = 'https://service-desk.local/problems/';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    detail?: string,
    public readonly errors?: ProblemFieldError[],
  ) {
    super(detail ?? title);
    this.name = 'AppError';
  }

  get type(): string {
    return TYPE_BASE + this.code;
  }

  static badRequest(detail: string, errors?: ProblemFieldError[]) {
    return new AppError(400, 'validation-error', 'Bad Request', detail, errors);
  }
  static unauthorized(detail = 'Authentication required') {
    return new AppError(401, 'unauthorized', 'Unauthorized', detail);
  }
  static forbidden(detail = 'Not enough permissions') {
    return new AppError(403, 'forbidden', 'Forbidden', detail);
  }
  static notFound(detail = 'Resource not found') {
    return new AppError(404, 'not-found', 'Not Found', detail);
  }
  static conflict(code: string, detail: string) {
    return new AppError(409, code, 'Conflict', detail);
  }
}

export function problemType(code: string): string {
  return TYPE_BASE + code;
}
