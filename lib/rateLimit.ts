// Limitador de requisições simples em memória (por instância do servidor).
// Na Vercel cada instância tem a sua própria contagem, então é uma barreira básica contra abuso
// e tentativas de adivinhar senha; para proteção forte, use também o Firewall da Vercel.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Retorna true se a requisição pode seguir, false se estourou o limite. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  // Limpeza ocasional para a memória não crescer sem controle
  if (buckets.size > 5000) {
    buckets.forEach((value, k) => {
      if (value.resetAt <= now) buckets.delete(k);
    });
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= limit;
}

/** Zera a contagem (ex.: após login bem-sucedido). */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'desconhecido';
}
