#!/usr/bin/env node
/**
 * CycleGuard — PIN Hash Generator
 * Usage: node backend/scripts/hashPin.js [4-to-6 digit PIN]
 * Generates a cryptographic scrypt hash: <saltHex>:<hashHex>
 */

const crypto = require('crypto');

const pin = process.argv[2] || process.env.PIN || '2873';

if (!/^\d{4,8}$/.test(pin)) {
  console.error('Error: PIN must be between 4 and 8 digits.');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pin, salt, 32);
const formatted = `${salt.toString('hex')}:${hash.toString('hex')}`;

console.log('Generated PIN Hash:');
console.log(formatted);
console.log('\nAdd this to your backend/.env and Render environment variables:');
console.log(`PIN_HASH=${formatted}`);
