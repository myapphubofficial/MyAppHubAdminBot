module.exports = async (req, res) => {
  try {
    console.log("Loading Telegram Bot...");
    const bot = require('../lib/telegramBot');
    console.log("Loading Firebase Admin...");
    const { db, admin } = require('../lib/firebaseAdmin');
    
    console.log("Testing Firestore...");
    const snap = await db.collection('users').limit(1).get();
    
    return res.status(200).send("Success! Users count: " + snap.size);
  } catch (err) {
    return res.status(200).send("Error require: " + err.message + "\nStack: " + err.stack);
  }
};
