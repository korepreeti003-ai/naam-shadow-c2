import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
  if (app) return app;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
        'Please configure your Firebase service account credentials.'
    );
  }

  let credential: admin.credential.Credential;

  try {
    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    credential = admin.credential.cert(serviceAccount);
  } catch {
    throw new Error(
      'Invalid FIREBASE_SERVICE_ACCOUNT_JSON — must be valid JSON from Firebase Console → Service Accounts.'
    );
  }

  if (admin.apps.length > 0) {
    app = admin.apps[0]!;
    return app;
  }

  app = admin.initializeApp({ credential });
  return app;
}

// ─── Per-project app cache (multi-Firebase support) ──────────────────────────

const projectApps = new Map<string, admin.app.App>();

export async function getMessagingForProject(projectId: string): Promise<admin.messaging.Messaging> {
  // Return main app's messaging if projectId matches main project
  const mainProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId || projectId === mainProjectId) {
    return getFirebaseAdmin().messaging();
  }

  if (projectApps.has(projectId)) {
    return projectApps.get(projectId)!.messaging();
  }

  // Load service account from Firestore projects collection
  const db = getFirestore();
  const snap = await db
    .collection(COLLECTIONS.PROJECTS)
    .where('projectId', '==', projectId)
    .limit(1)
    .get();

  if (snap.empty || !snap.docs[0].data().serviceAccountJson) {
    // Fallback to main app
    return getFirebaseAdmin().messaging();
  }

  const serviceAccount = JSON.parse(snap.docs[0].data().serviceAccountJson as string) as admin.ServiceAccount;
  const appName = `proj-${projectId}`;
  const existing = admin.apps.find((a) => a?.name === appName);
  const projApp = existing ?? admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, appName);
  projectApps.set(projectId, projApp);
  return projApp.messaging();
}

export function invalidateProjectApp(projectId: string): void {
  projectApps.delete(projectId);
}

export function getFirestore(): admin.firestore.Firestore {
  return getFirebaseAdmin().firestore();
}

export function getMessaging(): admin.messaging.Messaging {
  return getFirebaseAdmin().messaging();
}

export function getAuth(): admin.auth.Auth {
  return getFirebaseAdmin().auth();
}

// ─── Collection refs ──────────────────────────────────────────────────────

export const COLLECTIONS = {
  DEVICES: 'devices',
  CAMPAIGNS: 'campaigns',
  CONTACTS: 'contacts',
  CONTACT_BATCHES: 'contactBatches',
  MESSAGES: 'messages',
  AUDIT_LOGS: 'auditLogs',
  PROJECTS: 'projects',
  USERS: 'users',
  OPTED_OUT: 'optedOut',
  DASHBOARD_STATS: 'dashboardStats',
} as const;

export function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

export function increment(n: number) {
  return admin.firestore.FieldValue.increment(n);
}

export function arrayUnion(...items: unknown[]) {
  return admin.firestore.FieldValue.arrayUnion(...items);
}
