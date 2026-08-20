const { db, admin } = require('./firebaseAdmin');

/**
 * Permanently delete a developer from Firebase Auth, Firestore 'developers', and all their apps.
 */
async function deleteDeveloperPermanently(uid) {
  const result = { authDeleted: false, devDocDeleted: false, appsDeleted: 0 };
  
  if (!uid) return result;

  // 1. Delete from Firebase Authentication
  try {
    if (admin && admin.auth) {
      await admin.auth().deleteUser(uid);
      result.authDeleted = true;
      console.log(`[Cleanup] Successfully deleted user ${uid} from Firebase Auth.`);
    }
  } catch (authErr) {
    console.warn(`[Cleanup] Auth delete error for ${uid} (may already be deleted):`, authErr.message);
  }

  // 2. Delete from Firestore 'developers' collection
  try {
    await db.collection('developers').doc(uid).delete();
    result.devDocDeleted = true;
    console.log(`[Cleanup] Deleted developer document ${uid} from Firestore.`);
  } catch (dbErr) {
    console.error(`[Cleanup] Error deleting developer document ${uid}:`, dbErr.message);
  }

  // 3. Delete all apps belonging to this developer
  try {
    const appsSnap = await db.collection('apps').where('developerUid', '==', uid).get();
    for (const appDoc of appsSnap.docs) {
      await db.collection('apps').doc(appDoc.id).delete();
      result.appsDeleted++;
    }
    console.log(`[Cleanup] Deleted ${result.appsDeleted} apps for developer ${uid}.`);
  } catch (appErr) {
    console.error(`[Cleanup] Error deleting apps for developer ${uid}:`, appErr.message);
  }

  return result;
}

/**
 * Automated Cleanup Engine
 * 1. Permanently deletes suspended developers after 24 hours.
 * 2. Deletes announcements older than 48 hours.
 * 3. Deletes notifications older than 48 hours.
 */
async function runAutoCleanup(options = {}) {
  const devHoursThreshold = options.devHoursThreshold || 24; // 24 hours default
  const generalHoursThreshold = options.generalHoursThreshold || 48; // 48 hours default
  
  const now = Date.now();
  const devThresholdMs = devHoursThreshold * 60 * 60 * 1000;
  const generalThresholdMs = generalHoursThreshold * 60 * 60 * 1000;

  const stats = {
    deletedDevs: 0,
    deletedAnnouncements: 0,
    deletedNotifications: 0,
    details: []
  };

  // --- 1. Clean up Suspended Developers (> 24h) ---
  try {
    const suspendedSnap = await db.collection('developers')
      .where('status', '==', 'suspended')
      .get();

    for (const doc of suspendedSnap.docs) {
      const data = doc.data();
      const suspendedAt = data.suspendedAt?.toMillis 
        ? data.suspendedAt.toMillis() 
        : (data.suspendedAt?.seconds 
            ? data.suspendedAt.seconds * 1000 
            : (data.suspendedAt ? new Date(data.suspendedAt).getTime() : 0));

      const createdAt = data.createdAt ? new Date(data.createdAt).getTime() : 0;
      const refTime = suspendedAt || createdAt || 0;

      // If suspended time exceeds threshold (or was suspended without timestamp)
      if (!suspendedAt || (now - refTime >= devThresholdMs)) {
        const uid = doc.id;
        const devName = data.name || data.email || uid;
        await deleteDeveloperPermanently(uid);
        stats.deletedDevs++;
        stats.details.push(`Dev: ${devName} (${uid})`);
      }
    }
  } catch (err) {
    console.error('[Cleanup] Error processing suspended developers:', err);
  }

  // --- 2. Clean up Old Announcements (> 48h) ---
  try {
    const annSnap = await db.collection('announcements').get();
    for (const doc of annSnap.docs) {
      const data = doc.data();
      const createdAt = data.createdAt?.toMillis 
        ? data.createdAt.toMillis() 
        : (data.createdAt?.seconds 
            ? data.createdAt.seconds * 1000 
            : (data.createdAt ? new Date(data.createdAt).getTime() : 0));

      if (createdAt && (now - createdAt >= generalThresholdMs)) {
        await db.collection('announcements').doc(doc.id).delete();
        stats.deletedAnnouncements++;
      }
    }
  } catch (err) {
    console.error('[Cleanup] Error processing old announcements:', err);
  }

  // --- 3. Clean up Old Notifications (> 48h) ---
  try {
    const notifSnap = await db.collection('notifications').get();
    for (const doc of notifSnap.docs) {
      const data = doc.data();
      const timestamp = data.timestamp?.toMillis 
        ? data.timestamp.toMillis() 
        : (data.timestamp?.seconds 
            ? data.timestamp.seconds * 1000 
            : (data.timestamp ? new Date(data.timestamp).getTime() : 0));

      if (timestamp && (now - timestamp >= generalThresholdMs)) {
        await db.collection('notifications').doc(doc.id).delete();
        stats.deletedNotifications++;
      }
    }
  } catch (err) {
    console.error('[Cleanup] Error processing old notifications:', err);
  }

  return stats;
}

module.exports = {
  deleteDeveloperPermanently,
  runAutoCleanup
};
