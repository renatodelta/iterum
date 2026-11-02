// Gera o hash seguro (scrypt) de uma senha, para usar em ADMIN_PASSWORD_HASH.
// Uso:  node scripts/hash-password.js "SuaSenhaForte123"
const { randomBytes, scryptSync } = require('crypto');

const password = process.argv[2];

if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error('Informe uma senha com pelo menos 8 caracteres, com letras e números.');
  console.error('Exemplo: node scripts/hash-password.js "SuaSenhaForte123"');
  process.exit(1);
}

// Mesmos parâmetros usados em lib/password.ts
const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const key = scryptSync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });

console.log(`scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`);
