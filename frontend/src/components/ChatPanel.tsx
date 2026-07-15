import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, ShieldBan } from 'lucide-react';
import type { ChatSession } from '../lib/chatClient';

type ChatPanelProps = {
  session: ChatSession | null;
  loading?: boolean;
  role: 'scanner' | 'owner';
  onSend: (body: string, isQuickReply?: boolean) => Promise<void>;
  onBlock?: () => Promise<void>;
  compact?: boolean;
};

export default function ChatPanel({
  session,
  loading,
  role,
  onSend,
  onBlock,
  compact,
}: ChatPanelProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages.length]);

  const quickReplies =
    role === 'scanner' ? session?.scannerQuickReplies ?? [] : session?.ownerQuickReplies ?? [];

  const handleSend = async (body: string, isQuickReply?: boolean) => {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body.trim(), isQuickReply);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

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
    <div className={`flex flex-col ${compact ? 'min-h-[320px]' : 'min-h-[420px]'} h-full`}>
      {readOnlyBanner && (
        <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
          {readOnlyBanner}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {session.messages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">
            {role === 'scanner'
              ? 'Send a message to the owner. They will get a push notification.'
              : 'No messages yet.'}
          </p>
        ) : (
          session.messages.map((m) => {
            const mine = (role === 'scanner' && m.senderRole === 'SCANNER') || (role === 'owner' && m.senderRole === 'OWNER');
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                    mine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white/10 text-slate-100 rounded-bl-md'
                  }`}
                >
                  {m.body}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {session.canSend && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => void handleSend(q, true)}
                className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 280))}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void handleSend(text)}
              placeholder="Type a message…"
              maxLength={280}
              className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-blue-500/40"
            />
            <button
              type="button"
              disabled={sending || !text.trim()}
              onClick={() => void handleSend(text)}
              className="px-3 rounded-xl bg-blue-600 disabled:opacity-50 flex items-center justify-center"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}

      {role === 'owner' && onBlock && session.status !== 'BLOCKED' && (
        <button
          type="button"
          onClick={() => void onBlock()}
          className="mt-2 text-xs text-red-400/80 hover:text-red-300 flex items-center gap-1 self-start"
        >
          <ShieldBan className="w-3.5 h-3.5" /> Block this scanner
        </button>
      )}
    </div>
  );
}
