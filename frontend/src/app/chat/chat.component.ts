import { Component } from '@angular/core';
import { ChatService, ChatResponse } from './chat.service';

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent {
  messages: ChatMessage[] = [];
  userInput = '';
  isLoading = false;

  constructor(private chatService: ChatService) { }

  sendMessage(): void {
    const text = this.userInput.trim();
    if (!text || this.isLoading) return;

    this.messages.push({ role: 'user', text });
    this.userInput = '';
    this.isLoading = true;

    this.chatService.askQuestion(text).subscribe({
      next: (response: ChatResponse) => {
        this.messages.push({ role: 'ai', text: response.answer });
        this.isLoading = false;
      },
      error: () => {
        this.messages.push({
          role: 'ai',
          text: 'Sorry, something went wrong. Make sure the backend is running on localhost:3000.'
        });
        this.isLoading = false;
      }
    });
  }
}
