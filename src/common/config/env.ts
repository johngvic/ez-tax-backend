// Fails at boot instead of silently falling back to a default — a missing
// bucket/table name must never make a dev deploy hit production resources.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
