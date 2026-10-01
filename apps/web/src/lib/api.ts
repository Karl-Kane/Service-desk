import { createApiClient, type Problem } from '@service-desk/api-client';

export const api = createApiClient('/api');

/** Ошибка API с телом problem+json — UI показывает detail и подсвечивает errors[].field. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: Problem | undefined,
  ) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
  }
}

/**
 * openapi-fetch возвращает { data, error, response } и не бросает исключений.
 * TanStack Query, наоборот, ждёт исключение при ошибке — этот хелпер их стыкует.
 */
export async function unwrap<T>(promise: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await promise;
  if (!response.ok) throw new ApiError(response.status, error as Problem | undefined);
  return data as T;
}
