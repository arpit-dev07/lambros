import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DocumentInfo {
    sourceFile: string;
    recordsInScan: number;
}

export interface DocumentsResponse {
    documents: DocumentInfo[];
    scannedRecords: number;
    pagesScanned: number;
    nextPaginationToken?: string;
    namespace: string;
    note?: string;
}

export interface UploadResponse {
    status: string;
    mode: string;
    message: string;
    jobId?: string;
    file: string;
    path: string;
    chunks?: number;
    records?: number;
}

export interface IngestionJob {
    id: string;
    status: 'queued' | 'processing' | 'done' | 'failed';
    file: string;
    path: string;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    stats: { chunks: number; records: number } | null;
    error: string | null;
}

export interface DeleteResponse {
    success: boolean;
    deleted: string;
    sourceFile: string;
    namespace: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class AdminService {
    private readonly apiUrl = 'http://localhost:3000/admin';

    constructor(private http: HttpClient) { }

    /** Upload a PDF file (async mode — returns jobId for polling) */
    uploadPdf(file: File): Observable<UploadResponse> {
        const formData = new FormData();
        formData.append('file', file, file.name);
        return this.http.post<UploadResponse>(`${this.apiUrl}/save-pdf`, formData);
    }

    /** Get status of an ingestion job */
    getJobStatus(jobId: string): Observable<IngestionJob> {
        return this.http.get<IngestionJob>(`${this.apiUrl}/jobs/${jobId}`);
    }

    /** List all documents from Pinecone */
    listDocuments(scanAll = true): Observable<DocumentsResponse> {
        return this.http.get<DocumentsResponse>(
            `${this.apiUrl}/documents?scanAll=${scanAll}`
        );
    }

    /** Delete a document by sourceFile name */
    deleteDocument(sourceFile: string): Observable<DeleteResponse> {
        return this.http.delete<DeleteResponse>(
            `${this.apiUrl}/documents?sourceFile=${encodeURIComponent(sourceFile)}&confirm=true`
        );
    }
}
