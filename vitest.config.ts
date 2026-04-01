import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.test.toml' },
        miniflare: {
          d1Databases: ['DB'],
          kvNamespaces: ['SESSIONS'],
          r2Buckets: ['DOCUMENTS'],
          bindings: {
            ENVIRONMENT: 'test',
            GOOGLE_CLIENT_ID: 'test-client-id',
            GOOGLE_CLIENT_SECRET: 'test-client-secret',
            JWT_SECRET: 'test-jwt-secret-that-is-long-enough',
            FRONTEND_URL: 'http://localhost:5173',
          },
        },
      },
    },
  },
});
