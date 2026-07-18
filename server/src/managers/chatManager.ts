import { nanoid } from 'nanoid';
import {
  MAX_CHAT_MESSAGES,
  MAX_CHAT_TOTAL_BYTES,
  type ChatMessage,
  type Participant,
} from '@ghostdesk/shared';

export class ChatManager {
  private messages: ChatMessage[] = [];
  private totalBytes = 0;

  add(sender: Participant, text: string): ChatMessage {
    const message: ChatMessage = {
      id: nanoid(10),
      participantId: sender.participantId,
      name: sender.name,
      color: sender.color,
      text,
      sentAt: Date.now(),
    };
    this.messages.push(message);
    this.totalBytes += Buffer.byteLength(text, 'utf8');

    // Enforce both caps — whichever hits first — by trimming the oldest.
    while (
      this.messages.length > MAX_CHAT_MESSAGES ||
      (this.totalBytes > MAX_CHAT_TOTAL_BYTES && this.messages.length > 1)
    ) {
      const dropped = this.messages.shift();
      if (dropped) this.totalBytes -= Buffer.byteLength(dropped.text, 'utf8');
    }
    return message;
  }

  snapshot(): ChatMessage[] {
    return this.messages;
  }

  destroy(): void {
    this.messages = [];
    this.totalBytes = 0;
  }
}
