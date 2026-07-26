module.exports = async (req, res) => {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_KEY;
    if (!serviceAccountJson) {
      return res.status(200).send("No FIREBASE_SERVICE_KEY found in process.env");
    }
    
    let parsed;
    try {
      parsed = JSON.parse(serviceAccountJson);
    } catch (e) {
      return res.status(200).send("JSON Parse Error: " + e.message + "\n\nRaw value length: " + serviceAccountJson.length + "\n\nRaw value start: " + serviceAccountJson.substring(0, 20));
    }

    if (typeof parsed === 'string') {
        return res.status(200).send("JSON parsed as a string, not an object. Did you surround it with quotes?");
    }
    
    if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
      return res.status(200).send("JSON parsed successfully, but missing project_id, private_key, or client_email.");
    }
    
    return res.status(200).send("Everything looks perfectly correct! Keys are present and valid JSON.");
  } catch (err) {
    return res.status(500).send("Error: " + err.message);
  }
};
