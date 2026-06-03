type Env = Record<string, string | undefined>;

function validateDatabaseUrl(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  if (value.includes('aws-0-region') || value.includes('YOUR_DATABASE_PASSWORD')) {
    throw new Error(`${name} still contains placeholder values. Use the exact Supabase connection string from Dashboard > Connect.`);
  }

  try {
    const url = new URL(value);

    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('invalid protocol');
    }
  } catch {
    throw new Error(`${name} must be a valid Postgres URL. Encode special password characters, for example @ as %40.`);
  }
}

function validateHttpUrl(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('invalid protocol');
    }
  } catch {
    throw new Error(`${name} must be a valid HTTP URL`);
  }
}

export function validateEnv(config: Env) {
  validateDatabaseUrl('DATABASE_URL', config.DATABASE_URL);
  validateDatabaseUrl('DIRECT_URL', config.DIRECT_URL);
  validateHttpUrl('SUPABASE_URL', config.SUPABASE_URL);

  if (!config.SUPABASE_PUBLISHABLE_KEY && !config.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required');
  }

  return config;
}
