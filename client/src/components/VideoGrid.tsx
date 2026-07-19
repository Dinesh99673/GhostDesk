import { useEffect, useRef, useState } from 'react';
import { REACTION_EMOJIS, type Participant } from '@ghostdesk/shared';
import { sendReaction, toggleCam, toggleMic } from '../lib/roomController.js';
import { useGhostStore } from '../lib/store.js';

export function VideoGrid() {
  const participants = useGhostStore((s) => s.participants);
  const selfId = useGhostStore((s) => s.selfId);
  const localStream = useGhostStore((s) => s.localStream);
  const remoteStreams = useGhostStore((s) => s.remoteStreams);
  const mediaError = useGhostStore((s) => s.mediaError);
  const micOn = useGhostStore((s) => s.micOn);
  const camOn = useGhostStore((s) => s.camOn);

  const others = Object.values(participants)
    .filter((p) => p.participantId !== selfId)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const self = selfId ? participants[selfId] : undefined;
  const tileCount = others.length + 1;
  // Portrait screens stack tiles so they stay wide; landscape/desktop spreads them out.
  const gridCols =
    tileCount <= 1
      ? 'grid-cols-1'
      : tileCount === 2
        ? 'grid-cols-1 landscape:grid-cols-2'
        : tileCount <= 4
          ? 'grid-cols-2'
          : 'grid-cols-2 landscape:grid-cols-3';

  return (
    <div className="flex h-full flex-col">
      {mediaError && (
        <div className="border-b border-amber-900 bg-amber-950/60 px-4 py-2 text-sm text-amber-300">
          {mediaError}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div className={`grid h-full auto-rows-fr gap-2 p-2 sm:gap-3 sm:p-4 ${gridCols}`}>
          {self && (
            <VideoTile participant={{ ...self, micOn, camOn }} stream={localStream} muted isSelf />
          )}
          {others.map((p) => (
            <VideoTile
              key={p.participantId}
              participant={p}
              stream={remoteStreams[p.participantId] ?? null}
              muted={false}
              isSelf={false}
            />
          ))}
        </div>
        <ReactionsOverlay />
      </div>
      <Controls micOn={micOn} camOn={camOn} />
    </div>
  );
}

function Controls({ micOn, camOn }: { micOn: boolean; camOn: boolean }) {
  const [showReactions, setShowReactions] = useState(false);
  return (
    <div className="relative flex items-center justify-center gap-3 border-t border-zinc-800 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {showReactions && (
        <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 gap-0.5 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 shadow-lg">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="rounded-full px-1.5 text-xl transition hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <ControlButton
        on={micOn}
        onClick={toggleMic}
        labelOn="Mute microphone"
        labelOff="Unmute microphone"
        iconOn="🎙️"
        iconOff="🔇"
      />
      <ControlButton
        on={camOn}
        onClick={toggleCam}
        labelOn="Turn camera off"
        labelOff="Turn camera on"
        iconOn="📷"
        iconOff="🚫"
      />
      <button
        onClick={() => setShowReactions((v) => !v)}
        title="Send a reaction"
        className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition ${
          showReactions ? 'bg-violet-700 hover:bg-violet-600' : 'bg-zinc-800 hover:bg-zinc-700'
        }`}
      >
        😊
      </button>
    </div>
  );
}

/** Meet-style floating reactions rising over the video grid. */
function ReactionsOverlay() {
  const reactions = useGhostStore((s) => s.reactions);
  if (reactions.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="reaction-float absolute bottom-2 flex flex-col items-center"
          style={{ left: `${8 + ((r.id * 37) % 70)}%` }}
        >
          <div className="text-4xl drop-shadow">{r.emoji}</div>
          <div
            className="mt-0.5 max-w-24 truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium"
            style={{ color: r.color }}
          >
            {r.name}
          </div>
        </div>
      ))}
    </div>
  );
}

function ControlButton({
  on,
  onClick,
  labelOn,
  labelOff,
  iconOn,
  iconOff,
}: {
  on: boolean;
  onClick: () => void;
  labelOn: string;
  labelOff: string;
  iconOn: string;
  iconOff: string;
}) {
  return (
    <button
      onClick={onClick}
      title={on ? labelOn : labelOff}
      className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition ${
        on ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-rose-700 hover:bg-rose-600'
      }`}
    >
      {on ? iconOn : iconOff}
    </button>
  );
}

function VideoTile({
  participant,
  stream,
  muted,
  isSelf,
}: {
  participant: Participant;
  stream: MediaStream | null;
  muted: boolean;
  isSelf: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = stream !== null && participant.camOn;

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream, showVideo]);

  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-zinc-900">
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full object-cover ${isSelf ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <>
          {/* Camera off: keep the audio flowing through a hidden element. */}
          {stream && !muted && <video ref={videoRef} autoPlay playsInline className="hidden" />}
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white sm:h-20 sm:w-20 sm:text-2xl"
            style={{ backgroundColor: participant.color }}
          >
            {participant.name.replace(/^Anonymous\s+/i, '').charAt(0).toUpperCase()}
          </div>
        </>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs">
        <span>{participant.name}</span>
        {isSelf && <span className="text-zinc-400">(you)</span>}
        {!participant.micOn && <span title="Muted">🔇</span>}
      </div>
    </div>
  );
}
