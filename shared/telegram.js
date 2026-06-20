const { getEnv } = require('./config');

const API_BASE = 'https://api.telegram.org';

async function telegramRequest(method, payload) {
  const token = getEnv('TELEGRAM_BOT_TOKEN');
  const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cleanPayload(payload)),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram API error (${method}): ${data.description || response.statusText}`);
  }
  return data.result;
}

function cleanPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null),
  );
}

function inlineKeyboard(rows) {
  return { inline_keyboard: rows };
}

function normalizeReplyMarkup(replyMarkup) {
  if (replyMarkup === undefined || replyMarkup === null || replyMarkup === '') return undefined;

  if (typeof replyMarkup === 'string') {
    try {
      const parsed = JSON.parse(replyMarkup);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  if (typeof replyMarkup === 'object' && !Array.isArray(replyMarkup)) return replyMarkup;
  return undefined;
}

function answerCallbackQuery(callbackQueryId, text) {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

function sendMessage(chatId, text, replyMarkup) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: normalizeReplyMarkup(replyMarkup),
    disable_web_page_preview: true,
  });
}

function editMessage(chatId, messageId, text, replyMarkup) {
  return telegramRequest('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: normalizeReplyMarkup(replyMarkup),
    disable_web_page_preview: true,
  });
}

function forwardMessage(chatId, fromChatId, messageId) {
  return telegramRequest('forwardMessage', {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
  });
}

function copyMessage(chatId, fromChatId, messageId, caption) {
  return telegramRequest('copyMessage', {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    caption,
    parse_mode: 'HTML',
  });
}

function setWebhook(url, secretToken) {
  return telegramRequest('setWebhook', {
    url,
    secret_token: secretToken || undefined,
    allowed_updates: ['message', 'callback_query'],
  });
}

module.exports = {
  inlineKeyboard,
  answerCallbackQuery,
  sendMessage,
  editMessage,
  forwardMessage,
  copyMessage,
  setWebhook,
  normalizeReplyMarkup,
  cleanPayload,
};
