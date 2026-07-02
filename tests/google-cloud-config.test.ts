import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/_apiError.js';
import {
  getGoogleCloudConfig,
  getVertexLyriaEndpoint,
  hasGoogleOidcConfig,
} from '../api/_googleCloud.js';

const keys = [
  'GCP_PROJECT_ID',
  'GCP_PROJECT_NUMBER',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'GCP_AUDIENCE',
  'GCP_VERTEX_LOCATION',
  'GCP_STORAGE_BUCKET',
] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));

after(() => {
  for (const key of keys) {
    const value = original[key];
    if (typeof value === 'string') process.env[key] = value;
    else delete process.env[key];
  }
});

test('fails closed when Google OIDC identifiers are missing', { concurrency: false }, () => {
  for (const key of keys) delete process.env[key];
  assert.equal(hasGoogleOidcConfig(), false);
  assert.throws(
    () => getGoogleCloudConfig(),
    (error) => error instanceof ApiError && error.status === 503,
  );
});

test('builds non-secret Google OIDC configuration from environment identifiers', { concurrency: false }, () => {
  process.env.GCP_PROJECT_ID = 'test-project';
  process.env.GCP_PROJECT_NUMBER = '123456789';
  process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'runtime@test-project.iam.gserviceaccount.com';
  process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel';
  process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel';
  process.env.GCP_STORAGE_BUCKET = 'test-generated-audio';
  delete process.env.GCP_AUDIENCE;
  delete process.env.GCP_VERTEX_LOCATION;

  const config = getGoogleCloudConfig();
  assert.equal(hasGoogleOidcConfig(), true);
  assert.equal(config.vertexLocation, 'us-central1');
  assert.match(config.audience, /^https:\/\/iam\.googleapis\.com\/projects\//);
});

test('builds the official global Vertex Lyria 3 interactions endpoint', () => {
  assert.equal(
    getVertexLyriaEndpoint('project with spaces'),
    'https://aiplatform.googleapis.com/v1beta1/projects/project%20with%20spaces/locations/global/interactions',
  );
});
