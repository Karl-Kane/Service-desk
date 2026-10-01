// Конфигурация из переменных окружения (12-factor). Читается один раз при старте.
// Ошибка в конфиге = падение при старте, а не в момент первого запроса.

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  logLevel: string;
  databaseUrl: string;
  sessionSecret: string;
  sessionTtlHours: number;
  cookieSecure: boolean;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as Config['nodeEnv'];
  const isProd = nodeEnv === 'production';

  const config: Config = {
    nodeEnv,
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    logLevel: process.env.LOG_LEVEL ?? (nodeEnv === 'test' ? 'silent' : 'info'),
    // В проде значения по умолчанию нет — без DATABASE_URL сервис не стартует.
    databaseUrl: required(
      'DATABASE_URL',
      isProd ? undefined : 'postgres://service_desk:service_desk@localhost:5432/service_desk',
    ),
    sessionSecret: required('SESSION_SECRET', isProd ? undefined : 'dev-only-session-secret-change-me-32chars'),
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 24 * 7),
    // Secure-cookie по умолчанию в проде. Локально по http:// браузер не отдаст Secure-cookie
    // никуда, кроме localhost, поэтому для dev/CI его можно выключить через COOKIE_SECURE=false.
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
    ...overrides,
  };

  if (config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  return config;
}
