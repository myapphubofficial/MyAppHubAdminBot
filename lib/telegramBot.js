const token = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = `https://api.telegram.org/bot${token}`;

const bot = {
  async request(method, data) {
    const res = await fetch(`${API_URL}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async sendMessage(chatId, text, options = {}) {
    return this.request('sendMessage', {
      chat_id: chatId,
      text: text,
      ...options
    });
  },
  
  async editMessageText(text, options = {}) {
    return this.request('editMessageText', {
      text: text,
      ...options
    });
  },
  
  async answerCallbackQuery(callbackQueryId, options = {}) {
    return this.request('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...options
    });
  }
};

module.exports = bot;
