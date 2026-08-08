const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveChatWriteUserId, resolveChatIdForWrite } = require('../chat-scope');

test('resolveChatWriteUserId prefers the explicit user id', () => {
  assert.equal(resolveChatWriteUserId('user-2', 'user-1'), 'user-2');
});

test('resolveChatWriteUserId falls back to the active task scope', () => {
  assert.equal(resolveChatWriteUserId(null, 'user-1'), 'user-1');
  assert.equal(resolveChatWriteUserId(undefined, 'user-1'), 'user-1');
});

test('resolveChatWriteUserId returns null when no user scope exists', () => {
  assert.equal(resolveChatWriteUserId(null, null), null);
});

test('resolveChatIdForWrite falls back to the active chat when the requested id is missing', () => {
  const store = {
    selectedChatId: 'chat-b',
    chats: [{ id: 'chat-a' }, { id: 'chat-b' }]
  };
  assert.equal(resolveChatIdForWrite('missing-chat', store), 'chat-b');
});

test('resolveChatIdForWrite returns the first chat when the store has no selection', () => {
  const store = { chats: [{ id: 'chat-a' }] };
  assert.equal(resolveChatIdForWrite(null, store), 'chat-a');
});
