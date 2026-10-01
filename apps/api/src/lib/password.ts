import argon2 from 'argon2';

// argon2id — победитель Password Hashing Competition, рекомендация OWASP.
// Соль и параметры хранятся внутри строки хэша ($argon2id$v=19$m=...,t=...,p=...$salt$hash),
// поэтому отдельная колонка под соль не нужна, а параметры можно поднять позже без миграции.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Хэш "пустышки": если пользователя с таким email нет, всё равно тратим время на verify,
// чтобы по времени ответа нельзя было определить, существует ли email (user enumeration).
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  return dummyHash;
}
