import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCheck, Loader2, RotateCcw, Send, ShieldBan } from 'lucide-react';
import type { ChatSession } from '../lib/chatClient';

type ChatPanelProps = {
  session: ChatSession | null;
  loading?: boolean;
  role: 'scanner' | 'owner';
  onSend: (body: string, isQuickReply?: boolean) => Promise<void>;
  onBlock?: () => Promise<void>;
  /** Anonymous scanner: leave chat and stop resume prompts */
  onEndChat?: () => void | Promise<void>;
  compact?: boolean;
  /** Full-height mobile owner chat — no fixed min-heights */
  mobile?: boolean;
  /** Wide desktop chat pane inside split layout */
  desktop?: boolean;
};

type OptimisticMessage = {
  id: string;
  body: string;
  status: 'pending' | 'failed';
  isQuickReply?: boolean;
  createdAt: number;
};

type DisplayMessage = {
  id: string;
  body: string;
  mine: boolean;
  senderRole: 'SCANNER' | 'OWNER';
  readAt: string | null;
  optimistic?: 'pending' | 'failed';
};

const MIN_SEND_SPINNER_MS = 350;

function displayNameFor(
  session: ChatSession,
  senderRole: 'SCANNER' | 'OWNER'
): string {
  if (senderRole === 'OWNER') {
    return session.ownerName?.trim() || 'Owner';
  }
  return session.scannerName?.trim() || 'Anonymous';
}

export default function ChatPanel({
  session,
  loading,
  role,
  onSend,
  onBlock,
  onEndChat,
  compact,
  mobile,
  desktop,
}: ChatPanelProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<OptimisticMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);

  const mySenderRole = role === 'scanner' ? 'SCANNER' : 'OWNER';

  useEffect(() => {
    if (session?.id !== sessionIdRef.current) {
      sessionIdRef.current = session?.id ?? null;
      setPending([]);
      setText('');
      setError(null);
      stickToBottomRef.current = true;
    }
  }, [session?.id]);

  // Confirm optimistic rows by matching body against newer server messages
  useEffect(() => {
    if (!session || pending.length === 0) return;
    setPending((prev) => {
      const used = new Set<string>();
      return prev.filter((p) => {
        if (p.status === 'failed') return true;
        const match = session.messages.find(
          (m) =>
            m.senderRole === mySenderRole &&
            m.body === p.body &&
            !used.has(m.id) &&
            new Date(m.createdAt).getTime() >= p.createdAt - 15_000
        );
        if (match) {
          used.add(match.id);
          return false;
        }
        return true;
      });
    });
  }, [session?.messages, mySenderRole, pending.length, session]);

  const displayMessages = useMemo((): DisplayMessage[] => {
    if (!session) return [];
    const server: DisplayMessage[] = session.messages.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderRole === mySenderRole,
      senderRole: m.senderRole,
      readAt: m.readAt ?? null,
    }));
    const optimistic: DisplayMessage[] = pending.map((p) => ({
      id: p.id,
      body: p.body,
      mine: true,
      senderRole: mySenderRole,
      readAt: null,
      optimistic: p.status,
    }));
    return [...server, ...optimistic];
  }, [session, pending, mySenderRole]);

  const scrollListToBottom = useCallback((smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollListToBottom(true);
  }, [displayMessages.length, pending.length, scrollListToBottom]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 80;
  };

  const quickReplies =
    role === 'scanner' ? session?.scannerQuickReplies ?? [] : session?.ownerQuickReplies ?? [];

  const handleSend = useCallback(
    async (body: string, isQuickReply?: boolean) => {
      const trimmed = body.trim();
      if (!trimmed || sending) return;

      const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const optimistic: OptimisticMessage = {
        id: tempId,
        body: trimmed,
        status: 'pending',
        isQuickReply,
        createdAt: Date.now(),
      };

      stickToBottomRef.current = true;
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
    [onSend, sending]
  );

  const retryFailed = useCallback(
    (item: OptimisticMessage) => {
      setPending((prev) => prev.filter((m) => m.id !== item.id));
      void handleSend(item.body, item.isQuickReply);
    },
    [handleSend]
  );

  // Soft loading: keep showing the open thread instead of a full-panel spinner
  if (loading && !session) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!session) {
    return <p className="text-muted text-sm text-center py-8">Chat unavailable.</p>;
  }

  const readOnlyBanner =
    session.readOnly
      ? 'Chat is read-only — messages can be viewed but not sent.'
      : session.status === 'BLOCKED'
        ? 'This chat has been blocked.'
        : session.status === 'CLOSED'
          ? 'This chat session has ended.'
          : null;

  const handleEndChat = async () => {
    if (!onEndChat || ending) return;
    setEnding(true);
    try {
      await onEndChat();
    } finally {
      setEnding(false);
    }
  };

  return (
    <div
      className={`flex flex-col h-full ${
        mobile || desktop ? 'min-h-0' : compact ? 'min-h-[320px]' : 'min-h-[420px]'
      }`}
    >
      {readOnlyBanner && (
        <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs">
          {readOnlyBanner}
        </div>
      )}

      {onEndChat && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => void handleEndChat()}
            disabled={ending}
            className="text-xs font-semibold text-muted hover:text-brand disabled:opacity-50"
          >
            {ending ? 'Ending…' : 'End chat'}
          </button>
        </div>
      )}

      <div
        ref={listRef}
        onScroll={onListScroll}
        className="flex-1 overflow-y-auto scrollbar-none space-y-3 min-h-0 py-1"
      >
        {displayMessages.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">
            {role === 'scanner'
              ? 'Send a message to the owner. They will get a push notification.'
              : 'No messages yet.'}
          </p>
        ) : (
          displayMessages.map((m) => {
            const name = m.mine ? null : displayNameFor(session, m.senderRole);
            return (
              <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                {name && (
                  <span className="mb-1 px-1 text-[11px] font-medium text-muted">
                    {name}
                  </span>
                )}
                <div
                  className={`max-w-[85%] md:max-w-[70%] lg:max-w-[60%] px-3 py-2 rounded-2xl text-sm flex items-end gap-1.5 ${
                    m.optimistic === 'failed'
                      ? 'bg-red-600/30 text-red-100 border border-red-500/40 rounded-br-md'
                      : m.mine
                        ? `bg-brand text-white rounded-br-md ${m.optimistic === 'pending' ? 'opacity-80' : ''}`
                        : 'bg-soft text-ink rounded-bl-md border border-line'
                  }`}
                >
                  <span className="break-words">{m.body}</span>
                  {m.mine && m.optimistic === 'pending' && (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin opacity-70 mb-0.5" />
                  )}
                  {m.mine && !m.optimistic && (
                    m.readAt ? (
                      <CheckCheck
                        className="w-3.5 h-3.5 shrink-0 text-accent mb-0.5"
                        aria-label="Read"
                      />
                    ) : (
                      <Check
                        className="w-3.5 h-3.5 shrink-0 opacity-70 mb-0.5"
                        aria-label="Sent"
                      />
                    )
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
            );
          })
        )}
      </div>

      {session.canSend && (
        <div className="mt-3 pt-3 border-t border-line space-y-2">
          <div
            className={`flex gap-1.5 ${
              mobile || desktop
                ? 'overflow-x-auto flex-nowrap scrollbar-none pb-0.5'
                : 'flex-wrap'
            }`}
          >
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => void handleSend(q, true)}
                className={`px-2.5 py-1 rounded-full bg-surface hover:bg-soft border border-line text-[11px] text-muted disabled:opacity-50 flex items-center gap-1 shrink-0 ${
                  mobile || desktop ? 'whitespace-nowrap' : ''
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
              className="flex-1 px-3 py-2.5 rounded-xl bg-surface border border-line text-sm outline-none focus:border-brand/40 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={sending || !text.trim()}
              onClick={() => void handleSend(text)}
              className="min-w-[44px] px-3 rounded-xl bg-brand hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center transition-colors text-white"
              aria-label={sending ? 'Sending…' : 'Send'}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          {error && (
            <p className="text-brand text-xs flex items-center gap-1">
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
          className={`mt-2 text-xs text-brand/80 hover:text-brand flex items-center gap-1 self-start ${
            mobile ? 'px-2 pb-1' : ''
          }`}
        >
          <ShieldBan className="w-3.5 h-3.5" /> Block this scanner
        </button>
      )}
    </div>
  );
}
