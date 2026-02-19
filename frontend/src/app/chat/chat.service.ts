import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChatResponse {
    answer: string;
    sources?: string[];
}

@Injectable({
    providedIn: 'root'
})
export class ChatService {
    private readonly apiUrl = 'http://localhost:3000/chat';

    constructor(private http: HttpClient) { }

    askQuestion(question: string, includeSources = true): Observable<ChatResponse> {
        return this.http.post<ChatResponse>(`${this.apiUrl}/ask?includeSources=${includeSources}`, {
            question,
            topK: 10
        });
    }
}
