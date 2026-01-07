
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DataService, DocItem } from '../../services/data.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './dashboard.component.html',
  styles: []
})
export class DashboardComponent {
  dataService = inject(DataService);
  fb = inject(FormBuilder);

  showForm = signal(false);
  docForm: FormGroup;

  // Derived state for filtering
  sortedDocs = computed(() => {
    const docs = this.dataService.documents();
    return docs.sort((a, b) => {
      return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
    });
  });

  stats = computed(() => {
    const docs = this.dataService.documents();
    const now = new Date();
    let expired = 0;
    let urgent = 0;
    let ok = 0;

    docs.forEach(d => {
      const exp = new Date(d.expirationDate);
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) expired++;
      else if (diffDays <= 7) urgent++;
      else ok++;
    });

    return { expired, urgent, ok, total: docs.length };
  });

  constructor() {
    this.docForm = this.fb.group({
      title: ['', Validators.required],
      category: ['General', Validators.required],
      details: [''],
      expirationDate: ['', Validators.required]
    });
  }

  toggleForm() {
    this.showForm.update(v => !v);
  }

  async onSubmit() {
    if (this.docForm.valid) {
      const formVal = this.docForm.value;
      await this.dataService.addDocument({
        title: formVal.title,
        category: formVal.category,
        details: formVal.details,
        expirationDate: new Date(formVal.expirationDate).toISOString()
      });
      this.docForm.reset({category: 'General'});
      this.showForm.set(false);
    }
  }

  deleteDoc(id: string) {
    if(confirm('Are you sure you want to delete this document?')) {
      this.dataService.deleteDocument(id);
    }
  }

  getDaysRemaining(dateStr: string): number {
    const now = new Date();
    const exp = new Date(dateStr);
    return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  getStatusColor(dateStr: string): string {
    const days = this.getDaysRemaining(dateStr);
    if (days < 0) return 'border-red-500 bg-red-900/20 text-red-200';
    if (days <= 7) return 'border-amber-500 bg-amber-900/20 text-amber-200';
    return 'border-emerald-500 bg-emerald-900/20 text-emerald-200';
  }
  
  getStatusText(dateStr: string): string {
      const days = this.getDaysRemaining(dateStr);
      if (days < 0) return 'Expired';
      if (days <= 7) return 'Renew Soon';
      return 'Active';
  }
}
