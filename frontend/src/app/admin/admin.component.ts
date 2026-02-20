import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { startWith, switchMap, takeUntil } from 'rxjs/operators';
import {
  AdminService,
  DocumentsResponse,
  IngestionJob
} from './admin.service';

export interface AdminDocument {
  name: string;
  size: string;
  pages: number | string;
  date: string;
  status: 'ready' | 'processing';
}

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit, OnDestroy {
  documents: AdminDocument[] = [];
  isUploading = false;
  isLoadingDocuments = false;
  errorText = '';
  private readonly storageKey = 'ai_recipe_admin_documents';

  private readonly destroy$ = new Subject<void>();
  private readonly pollStopMap = new Map<string, Subject<void>>();

  constructor(
    private adminService: AdminService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.restoreDocuments();
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.pollStopMap.forEach((stop$) => {
      stop$.next();
      stop$.complete();
    });
    this.pollStopMap.clear();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || this.isUploading) {
      if (input) input.value = '';
      return;
    }

    this.errorText = '';
    this.isUploading = true;

    this.adminService.uploadPdf(file).subscribe({
      next: (response) => {
        this.isUploading = false;

        if (response.jobId) {
          this.startPollingJob(response.jobId);
          this.addLocalProcessingDoc(file.name);
        } else {
          this.loadDocuments();
        }

        if (input) input.value = '';
      },
      error: (error: unknown) => {
        this.isUploading = false;
        this.errorText = this.toErrorText('Upload failed', error);
        if (input) input.value = '';
      }
    });
  }

  removeDocument(index: number): void {
    const doc = this.documents[index];
    if (!doc) return;

    this.adminService.deleteDocument(doc.name).subscribe({
      next: () => {
        this.documents = this.documents.filter((_, i) => i !== index);
        this.persistDocuments();
      },
      error: (error: unknown) => {
        this.errorText = this.toErrorText('Delete request failed', error);
      }
    });
  }

  openChat(): void {
    this.router.navigate(['/chat']);
  }

  refreshDocuments(): void {
    this.loadDocuments();
  }

  private loadDocuments(): void {
    this.isLoadingDocuments = true;
    this.adminService.listDocuments(false).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: DocumentsResponse) => {
        const nextDocuments = this.mapDocuments(response);
        if (!this.isSameDocuments(this.documents, nextDocuments)) {
          this.documents = nextDocuments;
          this.persistDocuments();
        }
        this.isLoadingDocuments = false;
      },
      error: (error: unknown) => {
        this.isLoadingDocuments = false;
        this.errorText = this.toErrorText(
          'Could not fetch documents from /admin/documents',
          error
        );
      }
    });
  }

  private startPollingJob(jobId: string): void {
    if (this.pollStopMap.has(jobId)) return;

    const stop$ = new Subject<void>();
    this.pollStopMap.set(jobId, stop$);

    interval(2200).pipe(
      startWith(0),
      switchMap(() => this.adminService.getJobStatus(jobId)),
      takeUntil(stop$),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (job: IngestionJob) => {
        if (job.status === 'done' || job.status === 'failed') {
          this.stopPollingJob(jobId);
          this.loadDocuments();
          if (job.status === 'failed') {
            this.errorText = job.error || 'Ingestion job failed.';
          }
        }
      },
      error: (error: unknown) => {
        this.stopPollingJob(jobId);
        this.errorText = this.toErrorText('Job polling failed', error);
      }
    });
  }

  private stopPollingJob(jobId: string): void {
    const stop$ = this.pollStopMap.get(jobId);
    if (!stop$) return;
    stop$.next();
    stop$.complete();
    this.pollStopMap.delete(jobId);
  }

  private addLocalProcessingDoc(fileName: string): void {
    const alreadyExists = this.documents.some((doc) => doc.name === fileName);
    if (alreadyExists) return;

    this.documents = [
      {
        name: fileName,
        size: '--',
        pages: '--',
        date: new Date().toISOString().slice(0, 10),
        status: 'processing'
      },
      ...this.documents
    ];
    this.persistDocuments();
  }

  private mapDocuments(response: DocumentsResponse): AdminDocument[] {
    if (!response.documents?.length) return [];

    return response.documents.map((doc) => ({
      name: doc.sourceFile,
      size: '--',
      pages: doc.recordsInScan ?? '--',
      date: new Date().toISOString().slice(0, 10),
      status: 'ready'
    }));
  }

  private isSameDocuments(current: AdminDocument[], next: AdminDocument[]): boolean {
    if (current.length !== next.length) return false;

    for (let index = 0; index < current.length; index += 1) {
      const currentDoc = current[index];
      const nextDoc = next[index];
      if (
        currentDoc.name !== nextDoc.name ||
        currentDoc.size !== nextDoc.size ||
        currentDoc.pages !== nextDoc.pages ||
        currentDoc.date !== nextDoc.date ||
        currentDoc.status !== nextDoc.status
      ) {
        return false;
      }
    }

    return true;
  }

  private persistDocuments(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.documents));
  }

  private restoreDocuments(): void {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      this.documents = parsed
        .filter((item) => {
          const validStatus = item?.status === 'ready' || item?.status === 'processing';
          return (
            typeof item?.name === 'string' &&
            typeof item?.size === 'string' &&
            (typeof item?.pages === 'string' || typeof item?.pages === 'number') &&
            typeof item?.date === 'string' &&
            validStatus
          );
        })
        .map((item) => ({
          name: item.name,
          size: item.size,
          pages: item.pages,
          date: item.date,
          status: item.status as 'ready' | 'processing'
        }));
    } catch {
      localStorage.removeItem(this.storageKey);
    }
  }

  private toErrorText(prefix: string, error: unknown): string {
    const err = error as HttpErrorResponse | undefined;
    const backendMessage =
      typeof err?.error?.error === 'string' ? err.error.error : undefined;
    const fallback = typeof err?.message === 'string' ? err.message : 'Unknown error';
    return `${prefix}: ${backendMessage || fallback}`;
  }
}
