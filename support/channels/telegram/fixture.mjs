export const deterministicShim = {
  conversationId: "12345",
  threadId: "12",
  replyToId: "900",
  config: {
    channels: {
      telegram: {
        botToken: "123:kova-channel-conformance-token"
      }
    }
  },
  platform: {
    resultMessageIdPrefix: "tg",
    resultTargetField: "chatId",
    replyOptionField: "replyToMessageId",
    replyOptionValue: 900,
    threadOptionField: "messageThreadId",
    threadOptionValue: 12
  }
};
