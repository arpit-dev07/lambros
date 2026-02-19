import { Component } from '@angular/core';

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
export class AdminComponent {
  documents: AdminDocument[] = [
    {
      name: 'Italian Classics - Complete Cookbook.pdf',
      size: '12.4 MB',
      pages: 342,
      date: '2026-02-14',
      status: 'ready'
    },
    {
      name: 'Fermentation Guide Vol 2.pdf',
      size: '8.1 MB',
      pages: 186,
      date: '2026-02-15',
      status: 'ready'
    },
    {
      name: 'Asian Street Food Recipes.pdf',
      size: '5.7 MB',
      pages: 94,
      date: '2026-02-16',
      status: 'processing'
    }
  ];

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    this.documents = [
      ...this.documents,
      {
        name: file.name,
        size: '--',
        pages: '--',
        date: new Date().toISOString().slice(0, 10),
        status: 'processing'
      }
    ];

    if (input) input.value = '';
  }

  removeDocument(index: number): void {
    this.documents = this.documents.filter((_, i) => i !== index);
  }
}
