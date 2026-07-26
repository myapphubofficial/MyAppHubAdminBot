const bot = require('../lib/telegramBot');
const { db } = require('../lib/firebaseAdmin');

module.exports = async (req, res) => {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { type, data } = req.body;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!adminChatId) {
    return res.status(500).json({ error: 'TELEGRAM_ADMIN_CHAT_ID not configured' });
  }

  try {
    if (type === 'NEW_DEVELOPER') {
      const { name, email, studioName, bio, linkedin, github, uid } = data;
      const message = `🚀 *New Developer Registration*\n\n*Name:* ${name}\n*Email:* ${email}\n*Studio:* ${studioName || 'N/A'}\n*Bio:* ${bio || 'N/A'}\n*LinkedIn:* ${linkedin || 'N/A'}\n*GitHub:* ${github || 'N/A'}`;
      
      const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Approve Dev', callback_data: `dev_approve_${uid}` }],
            [{ text: '❌ Suspend Dev', callback_data: `dev_suspend_${uid}` }]
          ]
        }
      };
      
      await bot.sendMessage(adminChatId, message, opts);
      return res.status(200).json({ success: true });
    }

    if (type === 'NEW_APP') {
      const { appId, appName, category, description, developerName } = data;
      const message = `📦 *New App Pending Review!*\n\n*App Name:* ${appName}\n*Category:* ${category || 'N/A'}\n*Developer:* ${developerName || 'Unknown'}\n\n*Description:*\n${description || 'N/A'}`;
      
      const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Approve', callback_data: `app_approve_${appId}` }, { text: '❌ Reject', callback_data: `app_reject_${appId}` }],
            [{ text: '📝 Action Required', callback_data: `app_action_${appId}` }]
          ]
        }
      };
      
      await bot.sendMessage(adminChatId, message, opts);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown event type' });
  } catch (error) {
    console.error('Notify error:', error);
    return res.status(500).json({ error: error.message });
  }
};
