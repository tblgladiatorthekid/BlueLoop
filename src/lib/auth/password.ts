import bcrypt from "bcryptjs";

// Cost factor 12 is a reasonable default in 2026: slow enough to resist
// offline cracking, fast enough not to make login feel sluggish on a
// mid-range phone-facing API.
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
