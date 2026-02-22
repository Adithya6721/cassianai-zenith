import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminApp: App;

function getAdminApp(): App {
  if (adminApp) return adminApp;

  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  // REQUIRE service account from environment
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY missing. Add your Firebase service account JSON to .env.local"
    );
  }

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  );

  adminApp = initializeApp({
    credential: cert(serviceAccount),
  });

  return adminApp;
}

export async function verifyIdToken(idToken: string) {
  const auth = getAuth(getAdminApp());
  return await auth.verifyIdToken(idToken);
}

export function getAdminFirestore() {
  const db = getFirestore(getAdminApp());
  // Prevent crashes on any undefined field values in documents
  try { db.settings({ ignoreUndefinedProperties: true }); } catch { /* already set */ }
  return db;
}
