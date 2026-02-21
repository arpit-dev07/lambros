import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChatService, ChatResponse } from './chat.service';

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  isStreaming?: boolean;
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, OnDestroy {
  @ViewChild('chatContainer') chatContainerRef?: ElementRef<HTMLDivElement>;
  messages: ChatMessage[] = [];
  userInput = '';
  isLoading = false;
  private readonly storageKey = 'ai_recipe_chat_messages';
  private streamTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private chatService: ChatService) { }

  ngOnInit(): void {
    this.restoreMessages();
    this.scrollToBottom();
  }

  ngOnDestroy(): void {
    this.stopStreaming();
  }

  sendMessage(): void {
    const text = this.userInput.trim();
    if (!text || this.isLoading) return;

    this.messages.push({ role: 'user', text });
    this.persistMessages();
    this.userInput = '';
    this.isLoading = true;
    this.scrollToBottom();

    const aiMessage: ChatMessage = { role: 'ai', text: '', isStreaming: true };
    this.messages.push(aiMessage);
    this.scrollToBottom();

    this.chatService.askQuestion(text).subscribe({
      next: (response: ChatResponse) => {
        this.streamAIMessage(response.answer, aiMessage);
      },
      error: () => {
        aiMessage.isStreaming = false;
        aiMessage.text = 'Sorry, something went wrong. Make sure the backend API is reachable at /api/chat.';
        this.persistMessages();
        this.isLoading = false;
        this.scrollToBottom();
      }
    });
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      const container = this.chatContainerRef?.nativeElement;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    });
  }

  private streamAIMessage(fullText: string, targetMessage: ChatMessage): void {
    this.stopStreaming();

    const text = (fullText || '').trim();
    if (!text) {
      targetMessage.isStreaming = false;
      targetMessage.text = 'No response from backend.';
      this.persistMessages();
      this.isLoading = false;
      return;
    }

    const chunkSize = text.length > 1200 ? 24 : text.length > 700 ? 14 : 8;
    let index = 0;
    let tick = 0;

    this.streamTimer = setInterval(() => {
      index = Math.min(index + chunkSize, text.length);
      targetMessage.text = this.normalizeAIText(text.slice(0, index));
      tick += 1;

      if (tick % 2 === 0) {
        this.scrollToBottom();
      }

      if (index >= text.length) {
        targetMessage.isStreaming = false;
        this.stopStreaming();
        this.persistMessages();
        this.isLoading = false;
        this.scrollToBottom();
      }
    }, 24);
  }

  private stopStreaming(): void {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
  }

  private persistMessages(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.messages));
  }

  private restoreMessages(): void {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      this.messages = parsed.filter((item): item is ChatMessage => {
        const role = item?.role;
        const text = item?.text;
        return (role === 'user' || role === 'ai') && typeof text === 'string';
      }).map((message) => ({
        role: message.role,
        text: message.role === 'ai' ? this.normalizeAIText(message.text) : message.text,
        isStreaming: false
      }));
    } catch {
      localStorage.removeItem(this.storageKey);
    }
  }

  private normalizeAIText(text: string): string {
    return (text || '')
      .replace(/\r/g, '')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`{1,3}/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
