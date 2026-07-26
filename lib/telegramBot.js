const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
// Initialize without polling, since Vercel uses webhooks
const bot = new TelegramBot(token, { polling: false });

module.exports = bot;
