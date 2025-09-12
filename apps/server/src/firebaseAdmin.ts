import admin from 'firebase-admin';

let initializedApp: admin.app.App | undefined;

if (!admin.apps.length) {
  const hasEnvCreds = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );

  const credential = hasEnvCreds
    ? admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    : admin.credential.applicationDefault();

  initializedApp = admin.initializeApp({ credential });
}

export const firebaseAuth = (initializedApp ?? admin.app()).auth();

