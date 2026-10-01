// Отдельная БД для тестов: тесты делают TRUNCATE, поэтому никогда не указываем на dev-базу.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://service_desk:service_desk@localhost:5432/service_desk_test';
