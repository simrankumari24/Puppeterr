function resolveChatWriteUserId(explicitUserId, activeTaskUserId) {
  if (explicitUserId && String(explicitUserId).trim()) {
    return String(explicitUserId).trim();
  }
  if (activeTaskUserId && String(activeTaskUserId).trim()) {
    return String(activeTaskUserId).trim();
  }
  return null;
}

function resolveChatIdForWrite(chatId, store) {
  if (!store || !Array.isArray(store.chats) || !store.chats.length) {
    return null;
  }

  const candidates = [];
  if (chatId && String(chatId).trim()) {
    candidates.push(String(chatId).trim());
  }
  if (store.selectedChatId && String(store.selectedChatId).trim()) {
    candidates.push(String(store.selectedChatId).trim());
  }

  const matched = candidates.find(id => store.chats.some(chat => chat.id === id));
  if (matched) {
    return matched;
  }

  return store.chats[0].id || null;
}

module.exports = { resolveChatWriteUserId, resolveChatIdForWrite };
