const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

let app;
if (!getApps().length) {
  try {
    let serviceAccount;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_KEY;
    if (serviceAccountJson) {
      serviceAccount = JSON.parse(serviceAccountJson);
    } else {
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      };
    }
    
    app = initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error.stack);
  }
} else {
  app = getApps()[0];
}

const db = getFirestore(app);

module.exports = { db, admin };
