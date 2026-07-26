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
        const appDoc = await db.collection('apps').doc(appId).get();
        const appData = appDoc.data();
        
        await db.collection('apps').doc(appId).update({ status: 'published' });
        
        if (appData && appData.developerUid) {
          fetch('https://myapphub-notifications.vercel.app/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetCollection: 'developers',
              targetId: appData.developerUid,
              title: '✅ App Approved!',
              body: `Congratulations! Your app "${appData.title}" has been approved and published.`
            })
          }).catch(console.error);
        }

        await bot.editMessageText(`${callbackQuery.message.text}\n\n*Status:* ✅ Approved & Published!`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        });
      }
      
      else if (data.startsWith('app_reject_')) {
        const appId = data.replace('app_reject_', '');
        const appDoc = await db.collection('apps').doc(appId).get();
        const appData = appDoc.data();
        
        await db.collection('apps').doc(appId).update({ status: 'rejected' });
        
        if (appData && appData.developerUid) {
          fetch('https://myapphub-notifications.vercel.app/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetCollection: 'developers',
              targetId: appData.developerUid,
              title: '❌ App Rejected',
              body: `Unfortunately, your app "${appData.title}" has been rejected. Please review our guidelines.`
            })
          }).catch(console.error);
        }

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
        
        fetch('https://myapphub-notifications.vercel.app/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetCollection: 'developers',
            targetId: uid,
            title: '🎉 Account Approved!',
            body: `Your Developer Account has been approved. You can now upload apps to MyAppHub!`
          })
        }).catch(console.error);

        await bot.editMessageText(`${callbackQuery.message.text}\n\n*Status:* ✅ Approved!`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        });
      }

      else if (data.startsWith('dev_suspend_')) {
        const uid = data.replace('dev_suspend_', '');
        await db.collection('developers').doc(uid).update({ status: 'suspended' });
        
        fetch('https://myapphub-notifications.vercel.app/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetCollection: 'developers',
            targetId: uid,
            title: '⚠️ Account Suspended',
            body: `Your Developer Account has been suspended by the Admin. Please contact support.`
          })
        }).catch(console.error);

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
          
          const appDoc = await db.collection('apps').doc(appId).get();
          const appData = appDoc.data();
          
          await db.collection('apps').doc(appId).update({ 
            status: 'action_required', 
            rejectionReason: text 
          });
          
          if (appData && appData.developerUid) {
            fetch('https://myapphub-notifications.vercel.app/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                targetCollection: 'developers',
                targetId: appData.developerUid,
                title: '📝 Action Required',
                body: `Action required for "${appData.title}": ${text}`
              })
            }).catch(console.error);
          }

          await bot.sendMessage(chatId, `✅ Marked app ${appId} as "Action Required" and sent the reason to the developer!`);
          return res.status(200).send('OK');
        }
      }

      // Pagination Helper
      const parseRange = (paramText) => {
        let start = 0;
        let limit = 10;
        const param = paramText.trim();
        if (param) {
          const parts = param.split('-');
          if (parts.length === 2) {
            const s = parseInt(parts[0]);
            const e = parseInt(parts[1]);
            if (!isNaN(s) && !isNaN(e) && s > 0 && e >= s) {
              start = s - 1;
              limit = (e - s) + 1;
            }
          } else {
            const l = parseInt(parts[0]);
            if (!isNaN(l) && l > 0) limit = l;
          }
        }
        return { start, limit };
      };

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

        // Trigger Push Notification Server
        try {
          const payload = {
            targetId: 'all',
            title: '📢 Admin Announcement',
            body: messageText
          };
          
          // Send to Users
          await fetch('https://myapphub-notifications.vercel.app/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, targetCollection: 'users' })
          });
          
          // Send to Developers
          await fetch('https://myapphub-notifications.vercel.app/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, targetCollection: 'developers' })
          });
        } catch (e) {
          console.error("Push Notification Failed", e);
        }
        
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

      else if (text.startsWith('/pending')) {
        const snap = await db.collection('apps').where('status', '==', 'pending').get();
        if (snap.empty) {
          await bot.sendMessage(chatId, '✅ No pending apps to review!');
        } else {
          await bot.sendMessage(chatId, `Found ${snap.size} pending apps:`);
          for (const doc of snap.docs) {
            const app = doc.data();
            const message = `📱 *${app.name}*\nDeveloper: ${app.developer}\nCategory: ${app.category}\nStatus: ${app.status || 'unknown'}\nDescription: ${app.shortDesc?.substring(0, 50) || ''}...`;
            await bot.sendMessage(chatId, message, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Approve', callback_data: `app_approve_${doc.id}` },
                    { text: '❌ Reject', callback_data: `app_reject_${doc.id}` }
                  ],
                  [
                    { text: '📝 Action Required', callback_data: `app_action_${doc.id}` }
                  ]
                ]
              }
            });
          }
        }
      }

      else if (text.startsWith('/info apps')) {
        const { start, limit } = parseRange(text.replace('/info apps', ''));
        const snap = await db.collection('apps').limit(100).get(); // Fetch 100 recent
        const docs = snap.docs.slice(start, start + limit);
        if (docs.length === 0) {
          await bot.sendMessage(chatId, `No apps found for range ${start + 1}-${start + limit}`);
        } else {
          let msgText = `📱 *Apps ${start + 1} - ${start + docs.length}*\n\n`;
          docs.forEach((doc, i) => {
            const app = doc.data();
            msgText += `*${start + i + 1}. ${app.name}*\n   Status: _${app.status || 'published'}_\n   Dev: ${app.developer}\n\n`;
          });
          await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
        }
      }

      else if (text.startsWith('/info users')) {
        const { start, limit } = parseRange(text.replace('/info users', ''));
        const snap = await db.collection('users').limit(100).get();
        const docs = snap.docs.slice(start, start + limit);
        if (docs.length === 0) {
          await bot.sendMessage(chatId, `No users found for range ${start + 1}-${start + limit}`);
        } else {
          let msgText = `👥 *Users ${start + 1} - ${start + docs.length}*\n\n`;
          docs.forEach((doc, i) => {
            const user = doc.data();
            msgText += `*${start + i + 1}. ${user.fullName || 'Unknown'}*\n   Email: ${user.email}\n\n`;
          });
          await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
        }
      }

      else if (text.startsWith('/info developers')) {
        const { start, limit } = parseRange(text.replace('/info developers', ''));
        const snap = await db.collection('developers').limit(100).get();
        const docs = snap.docs.slice(start, start + limit);
        if (docs.length === 0) {
          await bot.sendMessage(chatId, `No developers found for range ${start + 1}-${start + limit}`);
        } else {
          let msgText = `👨‍💻 *Developers ${start + 1} - ${start + docs.length}*\n\n`;
          docs.forEach((doc, i) => {
            const dev = doc.data();
            msgText += `*${start + i + 1}. ${dev.name || 'Unknown'}*\n   Email: ${dev.email}\n   Status: _${dev.status}_\n\n`;
          });
          await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
        }
      }

      else if (text.startsWith('/info app ')) {
        const query = text.replace('/info app ', '').trim().toLowerCase();
        const snap = await db.collection('apps').get();
        const matches = snap.docs.filter(d => d.data().name && d.data().name.toLowerCase().includes(query));
        
        if (matches.length === 0) {
          await bot.sendMessage(chatId, `❌ No apps found matching "${query}"`);
        } else {
          for (const doc of matches.slice(0, 3)) { // Limit to 3 matches
            const app = doc.data();
            const message = `📱 *${app.name}*\nID: \`${doc.id}\`\nDeveloper: ${app.developer}\nCategory: ${app.category}\nStatus: *${app.status || 'published'}*\nDownloads: ${app.downloads || 0}\nDescription: ${app.shortDesc?.substring(0, 100) || ''}...`;
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          }
        }
      }

      else if (text.startsWith('/info developer ')) {
        const query = text.replace('/info developer ', '').trim().toLowerCase();
        const snap = await db.collection('developers').get();
        const matches = snap.docs.filter(d => d.data().name && d.data().name.toLowerCase().includes(query));
        
        if (matches.length === 0) {
          await bot.sendMessage(chatId, `❌ No developers found matching "${query}"`);
        } else {
          for (const doc of matches.slice(0, 3)) {
            const dev = doc.data();
            const message = `👨‍💻 *${dev.name}*\nID: \`${doc.id}\`\nEmail: ${dev.email}\nStatus: *${dev.status || 'approved'}*\nJoined: ${dev.createdAt ? new Date(dev.createdAt.toDate()).toLocaleDateString() : 'Unknown'}`;
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          }
        }
      }

      else if (text.startsWith('/info user ')) {
        const query = text.replace('/info user ', '').trim().toLowerCase();
        const snap = await db.collection('users').get();
        const matches = snap.docs.filter(d => d.data().fullName && d.data().fullName.toLowerCase().includes(query));
        
        if (matches.length === 0) {
          await bot.sendMessage(chatId, `❌ No users found matching "${query}"`);
        } else {
          for (const doc of matches.slice(0, 3)) {
            const user = doc.data();
            const message = `👥 *${user.fullName}*\nID: \`${doc.id}\`\nUsername: @${user.username || 'unknown'}\nEmail: ${user.email}\nJoined: ${user.createdAt ? new Date(user.createdAt.toDate()).toLocaleDateString() : 'Unknown'}`;
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    try {
      await bot.sendMessage(adminChatId, `⚠️ Fatal Error: ${error.message}`.substring(0, 4000));
    } catch(e) {}
    res.status(200).send('OK');
  }
};
