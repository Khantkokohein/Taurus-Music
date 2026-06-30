import admin from 'firebase-admin';
import {
  getFirebaseAdminOidcCredential,
  hasGoogleOidcConfig,
} from './_googleCloud.js';

const getServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) return null;

  const json = raw.trim().startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');

  return JSON.parse(json);
};

const getProjectId = () => (
  process.env.GCP_PROJECT_ID
  || process.env.GOOGLE_CLOUD_PROJECT
  || process.env.GCLOUD_PROJECT
  || undefined
);

export const getAdminApp = () => {
  if (!admin.apps.length) {
    const serviceAccount = getServiceAccount();
    const projectId = getProjectId();
    const options: admin.AppOptions = { projectId };

    if (hasGoogleOidcConfig()) {
      options.credential = getFirebaseAdminOidcCredential() as admin.credential.Credential;
    } else if (serviceAccount) {
      options.credential = admin.credential.cert(serviceAccount);
    } else if (!process.env.FIRESTORE_EMULATOR_HOST) {
      options.credential = admin.credential.applicationDefault();
    }

    admin.initializeApp(options);
  }

  return admin.app();
};

export const getAdminDb = () => getAdminApp().firestore();
export const getAdminAuth = () => getAdminApp().auth();
export const adminFieldValue = admin.firestore.FieldValue;
export const adminTimestamp = admin.firestore.Timestamp;
