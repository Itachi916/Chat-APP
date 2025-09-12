"use client";
import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { getSocket, emitJoin, emitTyping } from "@/lib/socket";
import MediaPreview from "./MediaPreview";

type Message = {
  id: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  type: "text" | "image" | "video";
  content: string;
  createdAt: number;
  deliveredAt?: number;
  readAt?: number;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [toUserId, setToUserId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<any>(null);
  const convIdRef = useRef<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        await signInAnonymously(auth);
      } else {
        setUser(u);
        if (!socketRef.current) {
          socketRef.current = await getSocket();
          emitJoin(socketRef.current, u.uid);
          socketRef.current.on('typing', (payload: { fromUserId: string; conversationId: string }) => {
            if (payload.conversationId === convIdRef.current) {
              setTyping(payload.fromUserId);
              if (typingTimeout.current) clearTimeout(typingTimeout.current);
              typingTimeout.current = setTimeout(() => setTyping(null), 1500);
            }
          });
          socketRef.current.on('message', async (msg: Message) => {
            if (msg.conversationId === convIdRef.current) {
              setMessages((m) => [...m, msg]);
              // If this message is addressed to me, immediately mark as read
              const myId = auth.currentUser?.uid;
              if (myId && msg.toUserId === myId && !msg.readAt) {
                try {
                  await api('/messages/read', {
                    method: 'POST',
                    body: JSON.stringify({ conversationId: msg.conversationId, messageId: msg.id })
                  });
                } catch {}
              }
            }
          });
          socketRef.current.on('delivered', (p: { conversationId: string; messageId: string; deliveredAt: number }) => {
            if (p.conversationId === convIdRef.current) {
              setMessages((m) => m.map(x => x.id === p.messageId ? { ...x, deliveredAt: p.deliveredAt } : x));
            }
          });
          socketRef.current.on('read', (p: { conversationId: string; messageId: string; readAt: number }) => {
            if (p.conversationId === convIdRef.current) {
              setMessages((m) => m.map(x => x.id === p.messageId ? { ...x, readAt: p.readAt } : x));
            }
          });
        }
      }
    });
    return () => unsub();
  }, []);

  async function api(path: string, init?: RequestInit) {
    if (!user) throw new Error("no user");
    const token = await user.getIdToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
    return res.json();
  }

  async function fetchHistory() {
    if (!conversationId) return;
    const data = await api(`/messages/history?conversationId=${encodeURIComponent(conversationId)}`);
    setMessages(Array.isArray(data?.messages) ? data.messages : []);
    // Mark messages addressed to me as read
    const myId = auth.currentUser?.uid;
    const toRead = (Array.isArray(data?.messages) ? data.messages : []).filter((m: Message) => !m.readAt && m.toUserId === myId);
    await Promise.all(toRead.map((m: Message) => api('/messages/read', { method: 'POST', body: JSON.stringify({ conversationId, messageId: m.id }) })));
  }

  // Auto-mark unread as read when tab is visible and conversation is active
  useEffect(() => {
    function markVisibleAsRead() {
      const myId = auth.currentUser?.uid;
      if (!myId || !conversationId || document.hidden) return;
      const unread = messages.filter((m) => !m.readAt && m.toUserId === myId && m.conversationId === conversationId);
      if (unread.length === 0) return;
      unread.forEach((m) => {
        api('/messages/read', { method: 'POST', body: JSON.stringify({ conversationId, messageId: m.id }) }).catch(() => {});
      });
    }
    const onVis = () => markVisibleAsRead();
    const onFocus = () => markVisibleAsRead();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    // initial attempt
    markVisibleAsRead();
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [messages, conversationId]);

  async function sendMessage() {
    if (!conversationId || !toUserId || !input) return;
    const data = await api(`/messages/send`, {
      method: "POST",
      body: JSON.stringify({ conversationId, toUserId, type: "text", content: input }),
    });
    if (data?.message) {
      // Append locally only for the sender; recipient will get socket event
      setMessages((m) => (m.find((x) => x.id === data.message.id) ? m : [...m, data.message]));
      setInput("");
    }
  }

  async function uploadMedia(file: File) {
    const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const key = `conversations/${conversationId}/${Date.now()}-${file.name}`;
    const up = await api(`/media/upload-url`, {
      method: "POST",
      body: JSON.stringify({ key, contentType: file.type }),
    });
    await fetch(up.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    const data = await api(`/messages/send`, {
      method: "POST",
      body: JSON.stringify({ conversationId, toUserId, type, content: key }),
    });
    if (data?.message) setMessages((m) => (m.find((x) => x.id === data.message.id) ? m : [...m, data.message]));
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h2>Realtime Chat (Demo)</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Conversation ID" value={conversationId} onChange={(e) => { setConversationId(e.target.value); convIdRef.current = e.target.value; }} />
        <input placeholder="To User ID" value={toUserId} onChange={(e) => setToUserId(e.target.value)} />
        <button onClick={fetchHistory}>Load</button>
      </div>
      <div style={{ marginTop: 16, border: "1px solid #ccc", padding: 8, minHeight: 200 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ margin: "8px 0" }}>
            <strong>{m.fromUserId === user?.uid ? "You" : m.fromUserId}:</strong>{" "}
            {m.type === 'text' ? (
              m.content
            ) : m.type === 'image' ? (
              <MediaPreview keyStr={m.id} contentKey={m.content} kind="image" />
            ) : (
              <MediaPreview keyStr={m.id} contentKey={m.content} kind="video" />
            )}
            {m.fromUserId === user?.uid ? (
              m.readAt ? <span style={{ marginLeft: 8, color: "green" }}>read</span> : m.deliveredAt ? <span style={{ marginLeft: 8 }}>delivered</span> : null
            ) : null}
          </div>
        ))}
        {typing ? <div style={{ opacity: 0.6 }}>{typing} is typing…</div> : null}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          placeholder="Type a message"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (user && toUserId && conversationId && socketRef.current) {
              emitTyping(socketRef.current, toUserId, conversationId);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
        />
        <button onClick={sendMessage}>Send</button>
        <input type="file" accept="image/*,video/*" onChange={(e) => {
          if (e.target.files?.[0]) uploadMedia(e.target.files[0]);
        }} />
      </div>
    </div>
  );
}
