import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isValidRoomId, type RoomError } from '@ghostdesk/shared';
import { ChatPanel } from '../components/ChatPanel.js';
import { CodeEditorPanel } from '../components/CodeEditorPanel.js';
import { FilesPanel } from '../components/FilesPanel.js';
import { NotesPanel } from '../components/NotesPanel.js';
import { PrivacyPanel } from '../components/PrivacyPanel.js';
import { RoomHeader } from '../components/RoomHeader.js';
import { VideoGrid } from '../components/VideoGrid.js';
import { WhiteboardPanel } from '../components/WhiteboardPanel.js';
import { joinRoom, unmountRoom } from '../lib/roomController.js';
import { useGhostStore } from '../lib/store.js';
import { useIsMobile } from '../lib/useIsMobile.js';

type MainTab = 'call' | 'whiteboard' | 'notes' | 'code';
type SideTab = 'chat' | 'files' | 'privacy';
type PanelTab = MainTab | SideTab;

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const phase = useGhostStore((s) => s.phase);
  const errorCode = useGhostStore((s) => s.errorCode);
  const valid = useMemo(() => Boolean(roomId && isValidRoomId(roomId)), [roomId]);

  useEffect(() => {
    if (!valid || !roomId) return;
    joinRoom(roomId);
    return () => unmountRoom();
  }, [valid, roomId]);

  if (!valid) return <DestroyedScreen />;

  switch (phase) {
    case 'joining':
      return <CenterScreen icon="👻" title="Entering the workspace…" subtitle="Connecting anonymously." pulse />;
    case 'destroyed':
      return <DestroyedScreen />;
    case 'left':
      return (
        <CenterScreen
          icon="👋"
          title="You left the workspace"
          subtitle="If you were the last one in, it will self-destruct in 30 seconds."
        >
          <Link to="/" className="mt-6 rounded-lg bg-violet-600 px-6 py-3 font-semibold hover:bg-violet-500">
            Back to home
          </Link>
        </CenterScreen>
      );
    case 'error':
      return <ErrorScreen code={errorCode} onRetry={() => roomId && joinRoom(roomId)} />;
    case 'joined':
      return <RoomShell />;
  }
}

function RoomShell() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileShell /> : <DesktopShell />;
}

function DesktopShell() {
  const [mainTab, setMainTab] = useState<MainTab>('call');
  const [sideTab, setSideTab] = useState<SideTab>('chat');

  return (
    <div className="flex h-full flex-col">
      <RoomHeader />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <nav className="flex gap-1 border-b border-zinc-800 px-3 pt-2">
            <TabButton active={mainTab === 'call'} onClick={() => setMainTab('call')} label="🎥 Call" />
            <TabButton
              active={mainTab === 'whiteboard'}
              onClick={() => setMainTab('whiteboard')}
              label="🖊️ Whiteboard"
            />
            <TabButton active={mainTab === 'notes'} onClick={() => setMainTab('notes')} label="📝 Notes" />
            <TabButton active={mainTab === 'code'} onClick={() => setMainTab('code')} label="💻 Code" />
          </nav>
          <div className="min-h-0 flex-1">
            {/* The call stays mounted while hidden so remote audio keeps playing on other tabs. */}
            <div className={mainTab === 'call' ? 'h-full' : 'hidden'}>
              <VideoGrid />
            </div>
            {mainTab === 'whiteboard' && <WhiteboardPanel />}
            {mainTab === 'notes' && <NotesPanel />}
            {mainTab === 'code' && <CodeEditorPanel />}
          </div>
        </main>
        <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800">
          <nav className="flex gap-1 border-b border-zinc-800 px-3 pt-2">
            <TabButton active={sideTab === 'chat'} onClick={() => setSideTab('chat')} label="💬 Chat" />
            <TabButton active={sideTab === 'files'} onClick={() => setSideTab('files')} label="📁 Files" />
            <TabButton active={sideTab === 'privacy'} onClick={() => setSideTab('privacy')} label="🛡️ Privacy" />
          </nav>
          <div className="min-h-0 flex-1">
            {sideTab === 'chat' && <ChatPanel />}
            {sideTab === 'files' && <FilesPanel />}
            {sideTab === 'privacy' && <PrivacyPanel />}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Single-panel layout for phones and small tablets: one tab bar, one panel at a time. */
function MobileShell() {
  const [tab, setTab] = useState<PanelTab>('call');

  return (
    <div className="flex h-full flex-col">
      <RoomHeader />
      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-zinc-800 px-2 pt-2">
        <TabButton active={tab === 'call'} onClick={() => setTab('call')} label="🎥 Call" />
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} label="💬 Chat" />
        <TabButton active={tab === 'whiteboard'} onClick={() => setTab('whiteboard')} label="🖊️ Board" />
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')} label="📝 Notes" />
        <TabButton active={tab === 'code'} onClick={() => setTab('code')} label="💻 Code" />
        <TabButton active={tab === 'files'} onClick={() => setTab('files')} label="📁 Files" />
        <TabButton active={tab === 'privacy'} onClick={() => setTab('privacy')} label="🛡️ Privacy" />
      </nav>
      <div className="min-h-0 flex-1">
        {/* The call stays mounted while hidden so remote audio keeps playing on other tabs. */}
        <div className={tab === 'call' ? 'h-full' : 'hidden'}>
          <VideoGrid />
        </div>
        {tab === 'chat' && <ChatPanel />}
        {tab === 'whiteboard' && <WhiteboardPanel />}
        {tab === 'notes' && <NotesPanel />}
        {tab === 'code' && <CodeEditorPanel />}
        {tab === 'files' && <FilesPanel />}
        {tab === 'privacy' && <PrivacyPanel />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium transition sm:px-4 ${
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  );
}

function CenterScreen({
  icon,
  title,
  subtitle,
  pulse,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  pulse?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
      <div className={`text-6xl ${pulse ? 'animate-pulse' : ''}`} aria-hidden>
        {icon}
      </div>
      <h1 className="mt-5 text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-2 max-w-md text-zinc-400">{subtitle}</p>}
      {children}
    </div>
  );
}

const DESTRUCTION_STAGES = [
  'Chat deleted',
  'Notes deleted',
  'Code deleted',
  'Whiteboard deleted',
  'Participants removed',
] as const;

/** The demo centerpiece: replays the room's destruction stage by stage. */
function DestroyedScreen() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (stage > DESTRUCTION_STAGES.length) return;
    const timer = setTimeout(() => setStage((s) => s + 1), stage === 0 ? 500 : 700);
    return () => clearTimeout(timer);
  }, [stage]);

  const finished = stage > DESTRUCTION_STAGES.length;

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
      <div className={`text-6xl transition-opacity duration-1000 ${finished ? 'opacity-30' : ''}`} aria-hidden>
        👻
      </div>
      <div className="mt-8 flex min-h-40 flex-col items-center gap-2">
        {DESTRUCTION_STAGES.map((label, i) => (
          <div
            key={label}
            className={`flex items-center gap-2 text-sm transition-all duration-500 ${
              stage > i ? 'fade-up text-zinc-400 line-through decoration-rose-500/70' : 'opacity-0'
            }`}
          >
            <span className="text-rose-400">🗑</span> {label}
          </div>
        ))}
        {finished && (
          <h1 className="fade-up mt-4 text-2xl font-bold text-zinc-100">
            Workspace permanently destroyed
          </h1>
        )}
        {finished && (
          <p className="fade-up mt-1 max-w-md text-zinc-500">
            Nothing was kept. No chat, no files, no traces — as promised.
          </p>
        )}
      </div>
      {finished && (
        <Link
          to="/"
          className="fade-up mt-6 rounded-lg bg-violet-600 px-6 py-3 font-semibold hover:bg-violet-500"
        >
          Create a new workspace
        </Link>
      )}
    </div>
  );
}

function ErrorScreen({ code, onRetry }: { code: RoomError | null; onRetry: () => void }) {
  const message =
    code === 'full'
      ? 'This workspace is full — a room holds at most 10 people.'
      : code === 'rate_limited'
        ? 'Too many attempts — wait a moment and try again.'
        : 'Something went wrong while joining.';
  return (
    <CenterScreen icon="🚪" title="Can't join right now" subtitle={message}>
      <div className="mt-6 flex gap-3">
        <button onClick={onRetry} className="rounded-lg bg-violet-600 px-5 py-2.5 font-semibold hover:bg-violet-500">
          Try again
        </button>
        <Link to="/" className="rounded-lg border border-zinc-700 px-5 py-2.5 font-semibold hover:bg-zinc-900">
          Home
        </Link>
      </div>
    </CenterScreen>
  );
}
