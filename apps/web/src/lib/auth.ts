import type { User } from '@service-desk/api-client';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, unwrap } from './api';

export const meQueryKey = ['me'] as const;

/** Текущий пользователь. 401 → null (не ошибка, а "не залогинен"). */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async (): Promise<User | null> => {
      try {
        return await unwrap(api.GET('/auth/me'));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}
