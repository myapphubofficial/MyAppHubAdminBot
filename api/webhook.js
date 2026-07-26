const bot = require('../lib/telegramBot');
const { db } = require('../lib/firebaseAdmin');
const { FieldValue } = require('firebase-admin/firestore');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  try {
    const body = req.body;
    
    // Process Callback Queries (Inline Button Clicks)
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const data = callbackQuery.data;
      const chatId = callbackQuery.message.chat.id.toString();
      const messageId = callbackQuery.message.message_id;

      if (chatId !== adminChatId) {
        return res.status(403).send('Forbidden');
      }

      if (data.startsWith('app_approve_')) {
        const appId = data.replace('app_approve_', '');
        await db.collection('apps').doc(appId).update({ status: 'published' });
        await bot.editMessageText(`${callbackQuery.message.text}\n\n*Status:* ✅ Approved & Published!`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        });
      }
      
      else if (data.startsWith('app_reject_')) {
        const appId = data.replace('app_reject_', '');
        await db.collection('apps').doc(appId).update({ status: 'rejected' });
        await bot.editMessageText(`${callbackQuery.message.text}\n\n*Status:* ❌ Rejected!`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        });
      }
      
      else if (data.startsWith('app_action_')) {
        const appId = data.replace('app_action_', '');
        // Force reply
        await bot.sendMessage(chatId, `📝 Please reply to this message with the correction reason for app ID: ${appId}`, {
          reply_markup: { force_reply: true }
        });
      }

      else if (data.startsWith('dev_approve_')) {
        const uid = data.replace('dev_approve_', '');
        await db.collection('developers').doc(uid).update({ status: 'approved' });
        await bot.editMessageText(`${callbackQuery.message.text}\n\n*Status:* ✅ Approved!`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        });
      }

      else if (data.startsWith('dev_suspend_')) {
        const uid = data.replace('dev_suspend_', '');
        await db.collection('developers').doc(uid).update({ status: 'suspended' });
        await bot.editMessageText(`${callbackQuery.message.text}\n\n*Status:* ❌ Suspended!`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        });
      }
      
      else if (data.startsWith('del_notif_')) {
        const notifId = data.replace('del_notif_', '');
        await db.collection('announcements').doc(notifId).delete();
        await bot.editMessageText(`✅ Notification Deleted!`, {
          chat_id: chatId,
          message_id: messageId
        });
      }

      // Answer callback query to remove loading state on the button
      await bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // Process Messages (Commands & Force Replies)
    else if (body.message) {
      const msg = body.message;
      const chatId = msg.chat.id.toString();
      const text = msg.text || '';

      if (chatId !== adminChatId) {
        return res.status(403).send('Forbidden');
      }

      // Check if it's a force reply (for Action Required)
      if (msg.reply_to_message && msg.reply_to_message.text.includes('correction reason for app ID:')) {
        const match = msg.reply_to_message.text.match(/app ID: (.+)/);
        if (match && match[1]) {
          const appId = match[1].trim();
          await db.collection('apps').doc(appId).update({ 
            status: 'action_required', 
            rejectionReason: text 
          });
          await bot.sendMessage(chatId, `✅ Marked app ${appId} as "Action Required" and sent the reason to the developer!`);
          return res.status(200).send('OK');
        }
      }

      // Commands
      if (text.startsWith('/stats')) {
        const [usersSnap, devsSnap, appsSnap] = await Promise.all([
          db.collection('users').count().get(),
          db.collection('developers').count().get(),
          db.collection('apps').count().get()
        ]);
        
        await bot.sendMessage(chatId, `📊 *Live Stats*\n\n👥 Users: ${usersSnap.data().count}\n👨‍💻 Developers: ${devsSnap.data().count}\n📱 Apps: ${appsSnap.data().count}`, { parse_mode: 'Markdown' });
      }
      
      else if (text.startsWith('/broadcast ')) {
        const messageText = text.replace('/broadcast ', '').trim();
        if (!messageText) {
           await bot.sendMessage(chatId, 'Please provide a message. Example: /broadcast Hello everyone!');
           return res.status(200).send('OK');
        }
        
        // Add to announcements collection
        await db.collection('announcements').add({
          developerUid: 'admin',
          developerName: 'Admin',
          appName: 'Global Announcement',
          text: messageText,
          createdAt: FieldValue.serverTimestamp()
        });
        
        await bot.sendMessage(chatId, `✅ Global broadcast sent:\n"${messageText}"`);
      }

      else if (text.startsWith('/notifications')) {
        // Fetch 5 most recent announcements
        const annSnap = await db.collection('announcements')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
            
        if (annSnap.empty) {
            await bot.sendMessage(chatId, 'No active notifications.');
        } else {
            await bot.sendMessage(chatId, '🔔 *Recent Notifications*', { parse_mode: 'Markdown' });
            for (const doc of annSnap.docs) {
                const ann = doc.data();
                await bot.sendMessage(chatId, `*${ann.appName || 'Announcement'}*\n${ann.text}`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🗑️ Delete', callback_data: `del_notif_${doc.id}` }]]
                    }
                });
            }
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
};
