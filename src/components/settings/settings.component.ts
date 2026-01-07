
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DataService, AppConfig } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styles: []
})
export class SettingsComponent {
  dataService = inject(DataService);
  authService = inject(AuthService);
  fb = inject(FormBuilder);

  settingsForm: FormGroup;
  
  // Test Connection State
  isTesting = signal(false);
  testResult = signal<{success: boolean, message: string} | null>(null);

  constructor() {
    this.settingsForm = this.fb.group({
      usePocketBase: [false],
      pbUrl: ['http://127.0.0.1:8090', Validators.required],
      pbAuthToken: [''] // Optional fallback token
    });

    // Load current settings into form
    const current = this.dataService.config();
    this.settingsForm.patchValue(current);
  }

  async testConnection() {
    const url = this.settingsForm.get('pbUrl')?.value;
    if (!url) return;

    this.isTesting.set(true);
    this.testResult.set(null);

    const result = await this.dataService.testConnection(url);
    
    this.testResult.set(result);
    this.isTesting.set(false);
  }

  saveSettings() {
    if (this.settingsForm.valid) {
      const newConfig: AppConfig = this.settingsForm.value;
      this.dataService.saveConfig(newConfig);
      alert('Configuration saved! Data source updated. Please Logout and Login again to use new settings.');
    }
  }
}
