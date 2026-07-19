import { useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { WHITEBOARD_THROTTLE_MS, type WhiteboardElement } from '@ghostdesk/shared';
import { sendPointer, sendWhiteboardDiff } from '../lib/roomController.js';
import { recordWhiteboardLocal, useGhostStore, wins } from '../lib/store.js';

/** Minimal slice of the Excalidraw imperative API that we rely on. */
interface ExcalidrawAPI {
  updateScene: (scene: { elements?: readonly unknown[]; collaborators?: Map<string, unknown> }) => void;
  getSceneElementsIncludingDeleted: () => readonly WhiteboardElement[];
}

export function WhiteboardPanel() {
  const [api, setApi] = useState<ExcalidrawAPI | null>(null);
  /** Last version we've synced per element — the local/remote echo filter. */
  const lastVersions = useRef(new Map<string, number>());
  const pending = useRef(new Map<string, WhiteboardElement>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerSent = useRef(0);
  const remoteTick = useGhostStore((s) => s.whiteboardRemoteTick);
  const pointers = useGhostStore((s) => s.pointers);
  const participants = useGhostStore((s) => s.participants);
  const selfId = useGhostStore((s) => s.selfId);
  const initialElements = useRef<WhiteboardElement[]>(
    Object.values(useGhostStore.getState().whiteboardElements)
  );

  useEffect(() => {
    for (const el of initialElements.current) lastVersions.current.set(el.id, el.version);
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      sendPointer(null);
    };
  }, []);

  // Pull remote elements into the canvas whenever new ones arrive.
  useEffect(() => {
    if (!api) return;
    const remote = useGhostStore.getState().whiteboardElements;
    const scene = new Map(api.getSceneElementsIncludingDeleted().map((el) => [el.id, el]));
    let changed = false;
    for (const el of Object.values(remote)) {
      const local = scene.get(el.id);
      if (!local || wins(el, local)) {
        scene.set(el.id, el);
        changed = true;
      }
    }
    if (changed) {
      api.updateScene({ elements: [...scene.values()] });
      // Re-read so restored versions never look like fresh local edits.
      for (const el of api.getSceneElementsIncludingDeleted()) {
        lastVersions.current.set(el.id, el.version);
      }
    }
  }, [api, remoteTick]);

  // Render remote pointers as native Excalidraw collaborator cursors.
  useEffect(() => {
    if (!api) return;
    const collaborators = new Map<string, unknown>();
    for (const [id, pointer] of Object.entries(pointers)) {
      if (id === selfId) continue;
      const p = participants[id];
      collaborators.set(id, {
        username: p?.name ?? 'Anonymous',
        pointer: { ...pointer, tool: 'pointer' },
      });
    }
    try {
      api.updateScene({ collaborators });
    } catch {
      // Cursor rendering is cosmetic — ignore API drift.
    }
  }, [api, pointers, participants, selfId]);

  const onChange = (elements: readonly unknown[]) => {
    let hasNew = false;
    for (const raw of elements as readonly WhiteboardElement[]) {
      const last = lastVersions.current.get(raw.id);
      if (last === undefined || raw.version > last) {
        pending.current.set(raw.id, raw);
        hasNew = true;
      }
    }
    if (!hasNew || flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      const batch = [...pending.current.values()].map(
        (el) => JSON.parse(JSON.stringify(el)) as WhiteboardElement
      );
      pending.current.clear();
      for (const el of batch) lastVersions.current.set(el.id, el.version);
      recordWhiteboardLocal(batch);
      sendWhiteboardDiff(batch);
    }, WHITEBOARD_THROTTLE_MS);
  };

  const onPointerUpdate = (payload: { pointer: { x: number; y: number } }) => {
    const now = Date.now();
    if (now - lastPointerSent.current < WHITEBOARD_THROTTLE_MS) return;
    lastPointerSent.current = now;
    sendPointer({ x: payload.pointer.x, y: payload.pointer.y });
  };

  return (
    <div className="h-full">
      <Excalidraw
        theme="dark"
        excalidrawAPI={(a) => setApi(a as unknown as ExcalidrawAPI)}
        initialData={{
          elements: initialElements.current as never[],
          appState: { viewBackgroundColor: '#18181b' },
        }}
        onChange={(elements) => onChange(elements)}
        onPointerUpdate={onPointerUpdate}
        UIOptions={{ tools: { image: false } }}
      />
    </div>
  );
}
