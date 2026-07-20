import { ArrowLeft, UserRound } from 'lucide-react';
import ChatPanel from './ChatPanel';
import { displayScannerLabel, type ChatSession } from '../lib/chatClient';
import type { api } from '../lib/api';

type SessionSummary = Awaited<ReturnType<typeof api.getChatSessions>>[number];

type OwnerMessagesViewProps = {
  sessions: SessionSummary[];
  openSessionId: string | null;
  activeSession: ChatSession | null;
  loadingSession: boolean;
  onSelectChat: (sessionId: string) => void;
  onBack: () => void;
  onSend: (body: string, isQuickReply?: boolean) => Promise<void>;
  onBlock: () => Promise<void>;
};

function contactLabel(s: SessionSummary | ChatSession | undefined): string {
  if (!s) return 'Anonymous';
  return displayScannerLabel(s);
}

function ConversationList({
  sessions,
  openSessionId,
  onSelectChat,
}: {
  sessions: SessionSummary[];
  openSessionId: string | null;
  onSelectChat: (sessionId: string) => void;
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-muted text-sm text-center py-16 px-6">
        No active chats yet. When someone messages you from a scan, it will show up here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {sessions.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onSelectChat(s.id)}
            className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
              openSessionId === s.id ? 'bg-soft border-l-2 border-l-brand' : 'hover:bg-soft/60 border-l-2 border-l-transparent'
            }`}
          >
            <div className="w-11 h-11 rounded-full bg-brand/10 border border-brand/25 flex items-center justify-center shrink-0">
              <UserRound className="w-5 h-5 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium text-sm truncate">{contactLabel(s)}</p>
                {s.lastMessage && (
                  <span className="text-[10px] text-muted shrink-0">
                    {new Date(s.lastMessage.createdAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted truncate">
                {s.vehicleName} · {s.vehicleNumber}
              </p>
              {s.lastMessage && (
                <p className="text-xs text-muted mt-0.5 truncate">{s.lastMessage.body}</p>
              )}
            </div>
            {s.lastMessage?.senderRole === 'SCANNER' && (
              <span className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function OwnerMessagesView({
  sessions,
  openSessionId,
  activeSession,
  loadingSession,
  onSelectChat,
  onBack,
  onSend,
  onBlock,
}: OwnerMessagesViewProps) {
  const activeSummary = sessions.find((s) => s.id === openSessionId);
  const showMobileChat = !!openSessionId;
  const headerName = contactLabel(activeSession ?? activeSummary);

  return (
    <div className="w-full flex flex-col lg:flex-row h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:h-[calc(100dvh-4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] border-t border-line bg-canvas">
      <aside
        className={`flex flex-col min-h-0 lg:w-80 xl:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-line bg-surface ${
          showMobileChat ? 'hidden lg:flex' : 'flex flex-1 lg:flex-none'
        }`}
      >
        <div className="px-5 py-4 border-b border-line shrink-0 flex items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-1 mt-0.5 rounded-lg hover:bg-soft text-ink lg:hidden"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Messages</h1>
            <p className="text-xs text-muted mt-0.5">Conversations from vehicle scans</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-none min-h-0">
          <ConversationList
            sessions={sessions}
            openSessionId={openSessionId}
            onSelectChat={onSelectChat}
          />
        </div>
      </aside>

      <section
        className={`flex flex-col min-h-0 flex-1 min-w-0 bg-canvas ${
          showMobileChat ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {openSessionId ? (
          <>
            <header className="flex items-center gap-3 px-4 py-3 border-b border-line shrink-0 bg-surface">
              <button
                type="button"
                onClick={onBack}
                className="p-2 -ml-1 rounded-lg hover:bg-soft text-ink lg:hidden"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{headerName}</p>
                <p className="text-[10px] text-muted truncate">
                  {(activeSession?.vehicleName ?? activeSummary?.vehicleName) || 'Vehicle'}
                  {' · '}
                  {activeSession?.vehicleNumber ?? activeSummary?.vehicleNumber}
                </p>
              </div>
            </header>
            <div className="flex-1 min-h-0 px-3 lg:px-6 pb-3 pt-2 max-w-3xl w-full mx-auto">
              <ChatPanel
                session={activeSession}
                loading={loadingSession}
                role="owner"
                onSend={onSend}
                onBlock={onBlock}
                desktop
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted text-sm px-6 text-center gap-2">
            <UserRound className="w-10 h-10 text-faint" />
            <p>Select a conversation to reply</p>
          </div>
        )}
      </section>
    </div>
  );
}
