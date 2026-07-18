import type { Participant } from '@ghostdesk/shared';

const ANIMALS = [
  'Fox', 'Panda', 'Owl', 'Eagle', 'Lynx', 'Otter', 'Raven', 'Wolf',
  'Heron', 'Badger', 'Falcon', 'Moose', 'Gecko', 'Puffin', 'Ibis', 'Stoat',
  'Marten', 'Osprey', 'Civet', 'Dingo', 'Tapir', 'Quokka', 'Serval', 'Kudu',
];

const COLORS = [
  '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6',
  '#eab308', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e',
];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic from participantId so identity is stable across reconnects. */
export function createAnonymousIdentity(participantId: string, taken: Set<string>): Pick<Participant, 'name' | 'color'> {
  const hash = hashString(participantId);
  const color = COLORS[hash % COLORS.length]!;

  let name = `Anonymous ${ANIMALS[hash % ANIMALS.length]!}`;
  let attempt = 1;
  while (taken.has(name) && attempt < ANIMALS.length) {
    name = `Anonymous ${ANIMALS[(hash + attempt) % ANIMALS.length]!}`;
    attempt++;
  }
  if (taken.has(name)) name = `Anonymous ${ANIMALS[hash % ANIMALS.length]!} ${(hash % 90) + 10}`;
  return { name, color };
}
