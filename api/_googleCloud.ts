import crypto from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import {
  ExternalAccountClient,
  GoogleAuth,
  type BaseExternalAccountClient,
} from 'google-auth-library';
import { ApiError } from './_apiError.js';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const SIGNED_URL_TTL_SECONDS = 10 * 60;

type GoogleCloudConfig = {
  projectId: string;
  projectNumber: string;
  serviceAccountEmail: string;
  workloadIdentityPoolId: string;
  workloadIdentityProviderId: string;
  audience: string;
  vertexLocation: string;
  storageBucket: string;
};

let externalClient: BaseExternalAccountClient | null = null;

const requiredEnv = (name: string) => {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new ApiError(503, 'GOOGLE_CLOUD_NOT_CONFIGURED', 'Google Cloud is not configured yet.');
  }
  return value;
};

export const hasGoogleOidcConfig = () => (
  !!process.env.GCP_PROJECT_ID
  && !!process.env.GCP_PROJECT_NUMBER
  && !!process.env.GCP_SERVICE_ACCOUNT_EMAIL
  && !!process.env.GCP_WORKLOAD_IDENTITY_POOL_ID
  && !!process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
);

export const getGoogleCloudConfig = (): GoogleCloudConfig => {
  const projectNumber = requiredEnv('GCP_PROJECT_NUMBER');
  const poolId = requiredEnv('GCP_WORKLOAD_IDENTITY_POOL_ID');
  const providerId = requiredEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID');
  const defaultAudience = `https://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;

  return {
    projectId: requiredEnv('GCP_PROJECT_ID'),
    projectNumber,
    serviceAccountEmail: requiredEnv('GCP_SERVICE_ACCOUNT_EMAIL'),
    workloadIdentityPoolId: poolId,
    workloadIdentityProviderId: providerId,
    audience: String(process.env.GCP_AUDIENCE || defaultAudience).trim(),
    vertexLocation: String(process.env.GCP_VERTEX_LOCATION || 'us-central1').trim(),
    storageBucket: requiredEnv('GCP_STORAGE_BUCKET'),
  };
};

export const getGoogleAuthClient = () => {
  if (externalClient) return externalClient;
  const config = getGoogleCloudConfig();
  const providerResource = `//iam.googleapis.com/projects/${config.projectNumber}/locations/global/workloadIdentityPools/${config.workloadIdentityPoolId}/providers/${config.workloadIdentityProviderId}`;
  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: providerResource,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.serviceAccountEmail}:generateAccessToken`,
    scopes: [CLOUD_PLATFORM_SCOPE],
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken({ audience: config.audience }),
    },
  });
  if (!client) {
    throw new ApiError(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Google Cloud authentication is unavailable.');
  }
  externalClient = client;
  return client;
};

export const getGoogleAccessToken = async () => {
  if (hasGoogleOidcConfig()) {
    const credentials = await getGoogleAuthClient().getAccessToken();
    if (!credentials.token) {
      throw new ApiError(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Google Cloud authentication is unavailable.');
    }
    return credentials.token;
  }

  const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  const client = await auth.getClient();
  const credentials = await client.getAccessToken();
  if (!credentials.token) {
    throw new ApiError(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Google Cloud authentication is unavailable.');
  }
  return credentials.token;
};

export const getFirebaseAdminOidcCredential = () => ({
  getAccessToken: async () => ({
    access_token: await getGoogleAccessToken(),
    expires_in: 50 * 60,
  }),
});

const encodePath = (value: string) => value
  .split('/')
  .map(segment => encodeURIComponent(segment))
  .join('/');

const createSignedDownloadUrl = async (
  bucket: string,
  objectName: string,
  expiresInSeconds = SIGNED_URL_TTL_SECONDS,
) => {
  const config = getGoogleCloudConfig();
  const accessToken = await getGoogleAccessToken();
  const now = new Date();
  const iso = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const date = iso.slice(0, 8);
  const credentialScope = `${date}/auto/storage/goog4_request`;
  const host = 'storage.googleapis.com';
  const canonicalUri = `/${encodePath(bucket)}/${encodePath(objectName)}`;
  const query = new URLSearchParams({
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': `${config.serviceAccountEmail}/${credentialScope}`,
    'X-Goog-Date': iso,
    'X-Goog-Expires': String(Math.max(60, Math.min(expiresInSeconds, 900))),
    'X-Goog-SignedHeaders': 'host',
  });
  query.sort();
  const canonicalRequest = [
    'GET',
    canonicalUri,
    query.toString(),
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'GOOG4-RSA-SHA256',
    iso,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const signResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(config.serviceAccountEmail)}:signBlob`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: Buffer.from(stringToSign).toString('base64'),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const signed = await signResponse.json().catch(() => ({}));
  if (!signResponse.ok || typeof signed.signedBlob !== 'string') {
    throw new ApiError(503, 'STORAGE_SIGNING_UNAVAILABLE', 'Generated audio download is temporarily unavailable.');
  }
  const signature = Buffer.from(signed.signedBlob, 'base64').toString('hex');
  return `https://${host}${canonicalUri}?${query.toString()}&X-Goog-Signature=${signature}`;
};

export const uploadGeneratedAudio = async ({
  uid,
  jobId,
  audio,
  mimeType,
}: {
  uid: string;
  jobId: string;
  audio: Buffer;
  mimeType: string;
}) => {
  const config = getGoogleCloudConfig();
  const accessToken = await getGoogleAccessToken();
  const safeExtension = mimeType === 'audio/wav'
    ? 'wav'
    : mimeType === 'audio/mpeg'
      ? 'mp3'
      : 'bin';
  const objectName = `generated/${uid}/${jobId}/audio.${safeExtension}`;
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(config.storageBucket)}/o`);
  uploadUrl.searchParams.set('uploadType', 'media');
  uploadUrl.searchParams.set('name', objectName);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType,
      'Content-Length': String(audio.byteLength),
    },
    body: audio,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new ApiError(503, 'STORAGE_UPLOAD_FAILED', 'Generated audio could not be stored.');
  }

  return {
    objectName,
    downloadUrl: await createSignedDownloadUrl(config.storageBucket, objectName),
  };
};

export const generateLyriaAudio = async ({
  prompt,
  negativePrompt,
}: {
  prompt: string;
  negativePrompt?: string;
}) => {
  const config = getGoogleCloudConfig();
  const accessToken = await getGoogleAccessToken();
  const endpoint = `https://${config.vertexLocation}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/locations/${encodeURIComponent(config.vertexLocation)}/publishers/google/models/lyria-002:predict`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{
        prompt: prompt.slice(0, 1800),
        ...(negativePrompt ? { negative_prompt: negativePrompt.slice(0, 500) } : {}),
      }],
      parameters: { sample_count: 1 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  const prediction = payload?.predictions?.[0];
  if (!response.ok || typeof prediction?.audioContent !== 'string') {
    throw new ApiError(502, 'GENERATION_PROVIDER_FAILED', 'The music provider did not return audio.');
  }
  return {
    audio: Buffer.from(prediction.audioContent, 'base64'),
    mimeType: prediction.mimeType === 'audio/wav' ? 'audio/wav' : 'audio/wav',
    model: 'lyria-002',
  };
};
