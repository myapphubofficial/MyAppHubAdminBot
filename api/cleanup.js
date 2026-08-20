const { runAutoCleanup } = require('../lib/cleanup');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const stats = await runAutoCleanup({ devHoursThreshold: 24, generalHoursThreshold: 48 });
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: `Cleaned ${stats.deletedDevs} suspended devs, ${stats.deletedAnnouncements} announcements, and ${stats.deletedNotifications} notifications.`,
      stats
    });
  } catch (error) {
    console.error('Cleanup endpoint error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
