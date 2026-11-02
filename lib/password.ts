import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

// Hash de senha com scrypt (nativo do Node, sem dependências extras).
// Formato salvo no banco: scrypt$N$r$p$salt(base64)$hash(base64)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const PREFIX = 'scrypt$';

function deriveKey(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Indica se o valor guardado já é um hash gerado por esta biblioteca. */
export function isPasswordHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** Gera o hash de uma senha em texto puro. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `${PREFIX}${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

function safeCompareText(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compara consigo mesmo para manter o tempo parecido e evita vazar o tamanho.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Confere a senha digitada com o valor guardado.
 * Aceita senhas antigas em texto puro (legado) para permitir a migração automática no primeiro
 * login: nesse caso `needsUpgrade` vem true e quem chamou deve salvar o novo hash.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!stored) return { valid: false, needsUpgrade: false };

  if (!isPasswordHash(stored)) {
    return { valid: safeCompareText(password, stored), needsUpgrade: true };
  }

  const parts = stored.split('$');
  // ['scrypt', N, r, p, salt, hash]
  if (parts.length !== 6) return { valid: false, needsUpgrade: false };

  const n = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  if (!n || !r || !p) return { valid: false, needsUpgrade: false };

  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  const key = await deriveKey(password, salt, n, r, p);

  if (key.length !== expected.length) return { valid: false, needsUpgrade: false };
  return { valid: timingSafeEqual(key, expected), needsUpgrade: false };
}

/** Regra mínima de senha para novos cadastros / trocas de senha. */
export function validatePasswordStrength(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'A senha deve ter pelo menos 8 caracteres.';
  }
  if (password.length > 128) {
    return 'A senha deve ter no máximo 128 caracteres.';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'A senha deve conter letras e números.';
  }
  return null;
}
