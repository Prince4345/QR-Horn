import { ArrowLeft, Car } from 'lucide-react';
import ChatPanel from './ChatPanel';
import type { ChatSession } from '../lib/chatClient';
import type { api } from '../lib/api';

type SessionSummary = Awaited<ReturnType<typeof api.getChatSessions>>[number];

type OwnerMessagesMobileProps = {
  sessions: SessionSummary[];
  openSessionId: string | null;
  activeSession: ChatSession | null;
  loadingSession: boolean;
  onSelectChat: (sessionId: string) => void;
  onBack: () => void;
  onSend: (body: string, isQuickReply?: boolean) => Promise<void>;
  onBlock: () => Promise<void>;
};

export default function OwnerMessagesMobile({
  sessions,
  openSessionId,
  activeSession,
  loadingSession,
  onSelectChat,
  onBack,
  onSend,
  onBlock,
}: OwnerMessagesMobileProps) {
  const activeSummary = sessions.find((s) => s.id === openSessionId);

  if (openSessionId) {
    return (
      <div className="w-full max-w-lg mx-auto flex flex-col h-[calc(100dvh-4.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/10 shrink-0 bg-[#0a0a0a]/90 backdrop-blur-md">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-1 rounded-full hover:bg-white/10 text-white"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">
              {activeSession?.vehicleName ?? activeSummary?.vehicleName ?? 'Chat'}
            </p>
            <p className="text-[10px] font-mono text-slate-500 truncate">
              {activeSession?.vehicleNumber ?? activeSummary?.vehicleNumber}
            </p>
          </div>
        </div>
        <div className="flex-1 min-h-0 px-2 pb-2">
          <ChatPanel
            session={activeSession}
            loading={loadingSession}
            role="owner"
            onSend={onSend}
            onBlock={onBlock}
            mobile
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col h-[calc(100dvh-4.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <h1 className="text-lg font-semibold">Messages</h1>
        <p className="text-xs text-slate-500">Tap a conversation to reply</p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {sessions.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-16 px-6">
            No active chats yet. When someone messages you from a scan, it will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectChat(s.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <div className="w-11 h-11 rounded-full bg-violet-600/25 border border-violet-500/30 flex items-center justify-center shrink-0">
                    <Car className="w-5 h-5 text-violet-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium text-sm truncate">{s.vehicleName}</p>
                      {s.lastMessage && (
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {new Date(s.lastMessage.createdAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-slate-500 truncate">{s.vehicleNumber}</p>
                    {s.lastMessage && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{s.lastMessage.body}</p>
                    )}
                  </div>
                  {s.lastMessage?.senderRole === 'SCANNER' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
