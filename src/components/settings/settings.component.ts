
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DataService, AppConfig } from '../../services/data.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styles: []
})
export class SettingsComponent {
  dataService = inject(DataService);
  fb = inject(FormBuilder);

  // Auth State
  isAuthenticated = signal(false);
  passwordAttempt = signal('');
  authError = signal('');
  
  // The actual password - In a real app this is backend handled. Here it is 'admin' for demo.
  private readonly ADMIN_PASS = 'admin'; 

  settingsForm: FormGroup;

  constructor() {
    this.settingsForm = this.fb.group({
      usePocketBase: [false],
      pbUrl: ['http://127.0.0.1:8090', Validators.required],
      pbCollection: ['notes', Validators.required],
      pbAuthToken: ['']
    });

    // Load current settings into form
    const current = this.dataService.config();
    this.settingsForm.patchValue(current);
  }

  unlock() {
    if (this.passwordAttempt() === this.ADMIN_PASS) {
      this.isAuthenticated.set(true);
      this.authError.set('');
    } else {
      this.authError.set('Incorrect password. Try "admin".');
    }
  }

  updatePassword(e: Event) {
    this.passwordAttempt.set((e.target as HTMLInputElement).value);
  }

  saveSettings() {
    if (this.settingsForm.valid) {
      const newConfig: AppConfig = this.settingsForm.value;
      this.dataService.saveConfig(newConfig);
      alert('Configuration saved! Data source updated.');
    }
  }
}
