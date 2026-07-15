import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, RotateCcw, Send, ShieldBan } from 'lucide-react';
import type { ChatSession } from '../lib/chatClient';

type ChatPanelProps = {
  session: ChatSession | null;
  loading?: boolean;
  role: 'scanner' | 'owner';
  onSend: (body: string, isQuickReply?: boolean) => Promise<void>;
  onBlock?: () => Promise<void>;
  compact?: boolean;
  /** Full-height mobile owner chat — no fixed min-heights */
  mobile?: boolean;
};

type OptimisticMessage = {
  id: string;
  body: string;
  status: 'pending' | 'failed';
  isQuickReply?: boolean;
  createdAt: number;
  serverMineCountAtSend: number;
};

type DisplayMessage = {
  id: string;
  body: string;
  mine: boolean;
  optimistic?: 'pending' | 'failed';
};

const MIN_SEND_SPINNER_MS = 350;

export default function ChatPanel({
  session,
  loading,
  role,
  onSend,
  onBlock,
  compact,
  mobile,
}: ChatPanelProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<OptimisticMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  const mySenderRole = role === 'scanner' ? 'SCANNER' : 'OWNER';

  useEffect(() => {
    if (session?.id !== sessionIdRef.current) {
      sessionIdRef.current = session?.id ?? null;
      setPending([]);
      setText('');
      setError(null);
    }
  }, [session?.id]);

  // Confirm optimistic rows when a new server message from us arrives (socket may beat HTTP)
  useEffect(() => {
    if (!session || pending.length === 0) return;
    const mineCount = session.messages.filter((m) => m.senderRole === mySenderRole).length;
    setPending((prev) =>
      prev.filter((p) => p.status === 'failed' || mineCount <= p.serverMineCountAtSend)
    );
  }, [session?.messages, mySenderRole, pending.length, session]);

  const displayMessages = useMemo((): DisplayMessage[] => {
    if (!session) return [];
    const server: DisplayMessage[] = session.messages.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderRole === mySenderRole,
    }));
    const optimistic: DisplayMessage[] = pending.map((p) => ({
      id: p.id,
      body: p.body,
      mine: true,
      optimistic: p.status,
    }));
    return [...server, ...optimistic];
  }, [session, pending, mySenderRole]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, pending.length]);

  const quickReplies =
    role === 'scanner' ? session?.scannerQuickReplies ?? [] : session?.ownerQuickReplies ?? [];

  const handleSend = useCallback(
    async (body: string, isQuickReply?: boolean) => {
      const trimmed = body.trim();
      if (!trimmed || sending) return;

      const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const serverMineCountAtSend = session
        ? session.messages.filter((m) => m.senderRole === mySenderRole).length
        : 0;
      const optimistic: OptimisticMessage = {
        id: tempId,
        body: trimmed,
        status: 'pending',
        isQuickReply,
        createdAt: Date.now(),
        serverMineCountAtSend,
      };

      setPending((prev) => [...prev, optimistic]);
      setText('');
      setSending(true);
      setError(null);

      const started = Date.now();
      try {
        await onSend(trimmed, isQuickReply);
        setPending((prev) => prev.filter((m) => m.id !== tempId));
      } catch (err) {
        setPending((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m))
        );
        setError(err instanceof Error ? err.message : 'Failed to send');
      } finally {
        const elapsed = Date.now() - started;
        if (elapsed < MIN_SEND_SPINNER_MS) {
          await new Promise((r) => setTimeout(r, MIN_SEND_SPINNER_MS - elapsed));
        }
        setSending(false);
      }
    },
    [onSend, sending, session, mySenderRole]
  );

  const retryFailed = useCallback(
    (item: OptimisticMessage) => {
      setPending((prev) => prev.filter((m) => m.id !== item.id));
      void handleSend(item.body, item.isQuickReply);
    },
    [handleSend]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!session) {
    return <p className="text-slate-500 text-sm text-center py-8">Chat unavailable.</p>;
  }

  const readOnlyBanner =
    session.readOnly
      ? 'Chat is read-only — messages can be viewed but not sent.'
      : session.status === 'BLOCKED'
        ? 'This chat has been blocked.'
        : session.status === 'CLOSED'
          ? 'This chat session has ended.'
          : null;

  return (
    <div
      className={`flex flex-col h-full ${
        mobile ? 'min-h-0' : compact ? 'min-h-[320px]' : 'min-h-[420px]'
      }`}
    >
      {readOnlyBanner && (
        <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
          {readOnlyBanner}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {displayMessages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">
            {role === 'scanner'
              ? 'Send a message to the owner. They will get a push notification.'
              : 'No messages yet.'}
          </p>
        ) : (
          displayMessages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm flex items-end gap-2 ${
                  m.optimistic === 'failed'
                    ? 'bg-red-600/30 text-red-100 border border-red-500/40 rounded-br-md'
                    : m.mine
                      ? `bg-blue-600 text-white rounded-br-md ${m.optimistic === 'pending' ? 'opacity-80' : ''}`
                      : 'bg-white/10 text-slate-100 rounded-bl-md'
                }`}
              >
                <span className="break-words">{m.body}</span>
                {m.mine && m.optimistic === 'pending' && (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin opacity-70" />
                )}
                {m.mine && !m.optimistic && (
                  <Check className="w-3.5 h-3.5 shrink-0 opacity-60" />
                )}
                {m.mine && m.optimistic === 'failed' && (
                  <button
                    type="button"
                    onClick={() => {
                      const item = pending.find((p) => p.id === m.id);
                      if (item) retryFailed(item);
                    }}
                    className="shrink-0 p-0.5 rounded hover:bg-red-500/30"
                    title="Retry send"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {session.canSend && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          <div className={`flex gap-1.5 ${mobile ? 'overflow-x-auto flex-nowrap scrollbar-none pb-0.5' : 'flex-wrap'}`}>
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => void handleSend(q, true)}
                className={`px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 disabled:opacity-50 flex items-center gap-1 shrink-0 ${
                  mobile ? 'whitespace-nowrap' : ''
                }`}
              >
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 280))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && text.trim() && !sending) {
                  e.preventDefault();
                  void handleSend(text);
                }
              }}
              placeholder="Type a message…"
              maxLength={280}
              disabled={sending}
              className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-blue-500/40 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={sending || !text.trim()}
              onClick={() => void handleSend(text)}
              className="min-w-[44px] px-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center transition-colors"
              aria-label={sending ? 'Sending…' : 'Send message'}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          {error && (
            <p className="text-red-400 text-xs flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}

      {role === 'owner' && onBlock && session.status !== 'BLOCKED' && (
        <button
          type="button"
          onClick={() => void onBlock()}
          className={`mt-2 text-xs text-red-400/80 hover:text-red-300 flex items-center gap-1 self-start ${
            mobile ? 'px-2 pb-1' : ''
          }`}
        >
          <ShieldBan className="w-3.5 h-3.5" /> Block this scanner
        </button>
      )}
    </div>
  );
}
