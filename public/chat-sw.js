function broadcastToClients(message) {
  return clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      client.postMessage(message);
    }
  });
}

function isIncomingCallData(data) {
  return data && (data.type === "incoming_call" || data.type === "incoming_group_call");
}

function buildChatOpenUrl(data) {
  const params = new URLSearchParams();
  params.set("openChat", "1");
  const chatType = data.chatType || data.chat_type;
  if (chatType) params.set("chatType", String(chatType));
  if (data.dialogId != null && data.dialogId !== "") params.set("dialogId", String(data.dialogId));
  if (data.messageId != null && data.messageId !== "") params.set("messageId", String(data.messageId));
  if (data.threadUserId != null && data.threadUserId !== "") params.set("threadUserId", String(data.threadUserId));
  if (data.userId != null && data.userId !== "") params.set("userId", String(data.userId));
  if (data.username) params.set("username", String(data.username));
  return "/?" + params.toString();
}

function buildIncomingCallSignal(data) {
  const from = {
    user_id: Number(data.from_user_id) || 0,
    username: String(data.from_username || ""),
    display_name: String(data.from_display_name || ""),
  };
  if (data.type === "incoming_group_call") {
    return {
      type: "incoming_group_call",
      call_id: String(data.call_id || ""),
      dialog_id: Number(data.dialog_id) || 0,
      dialog_name: String(data.dialog_name || "Групповой звонок"),
      video: data.video === "1" || data.video === true,
      from,
      participants: [from],
    };
  }
  return {
    type: "incoming_call",
    call_id: String(data.call_id || ""),
    kind: "private",
    dialog_id: Number(data.dialog_id) || 0,
    from,
    video: data.video === "1" || data.video === true,
  };
}

function buildChatOpenMessage(data) {
  const chatType = data.chatType || data.chat_type;
  const payload = { nonce: Date.now() };
  if (chatType === "private" || chatType === "group" || chatType === "bot" || chatType === "general") {
    payload.kind = chatType;
  } else if (data.threadUserId) {
    payload.kind = "bot";
  } else if (data.userId) {
    payload.kind = "private";
  } else if (data.dialogId) {
    payload.kind = "group";
  } else {
    payload.kind = "general";
  }
  if (data.dialogId) payload.dialogId = Number(data.dialogId) || undefined;
  if (data.messageId) payload.messageId = Number(data.messageId) || undefined;
  if (data.threadUserId) payload.threadUserId = Number(data.threadUserId) || undefined;
  if (data.userId) payload.userId = Number(data.userId) || undefined;
  if (data.username) payload.username = String(data.username);
  return { type: "crm-open-chat", detail: payload };
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const data = payload.data || {};
  const title = payload.title || "Mosoptika";
  const body = payload.body || "Новое сообщение";

  if (isIncomingCallData(data)) {
    const callId = data.call_id || "call";
    const signal = buildIncomingCallSignal(data);
    event.waitUntil(
      self.registration
        .showNotification(title, {
          body,
          tag: `crm-call-${callId}`,
          data,
          badge: "/favicon.ico",
          icon: "/favicon.ico",
          requireInteraction: true,
        })
        .then(() =>
          broadcastToClients({
            type: "crm-incoming-call",
            signal,
          })
        )
    );
    return;
  }

  const notifyData = { ...data };
  if (!notifyData.url) {
    notifyData.url = buildChatOpenUrl(notifyData);
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: "crm-chat",
      data: notifyData,
      badge: "/favicon.ico",
      icon: "/favicon.ico",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = isIncomingCallData(data) ? data.url || "/" : data.url || buildChatOpenUrl(data);
  const signal = isIncomingCallData(data) ? buildIncomingCallSignal(data) : null;
  const openChatMsg = isIncomingCallData(data) ? null : buildChatOpenMessage(data);

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      if (signal) {
        for (const client of clientList) {
          client.postMessage({ type: "crm-incoming-call", signal });
        }
      }
      if (openChatMsg) {
        for (const client of clientList) {
          client.postMessage(openChatMsg);
        }
      }
      for (const client of clientList) {
        if ("focus" in client) {
          if (url && "navigate" in client) {
            return client.navigate(url).then(() => client.focus());
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url).then((opened) => {
          if (opened && signal) {
            opened.postMessage({ type: "crm-incoming-call", signal });
          }
          if (opened && openChatMsg) {
            opened.postMessage(openChatMsg);
          }
          return opened;
        });
      }
      return null;
    })
  );
});
