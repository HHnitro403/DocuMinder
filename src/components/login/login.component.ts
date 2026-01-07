
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styles: []
})
export class LoginComponent {
  authService = inject(AuthService);
  dataService = inject(DataService);
  fb = inject(FormBuilder);
  
  errorMsg = signal('');
  isLoggingIn = signal(false);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  async onSubmit() {
    if (this.loginForm.valid) {
      this.isLoggingIn.set(true);
      this.errorMsg.set('');
      
      const { email, password } = this.loginForm.value;
      
      const success = await this.authService.login(email!, password!);
      
      this.isLoggingIn.set(false);
      
      if (!success) {
        const isPb = this.dataService.config().usePocketBase;
        if (isPb) {
             this.errorMsg.set('Invalid Database Credentials. Please check your email and password.');
        } else {
             this.errorMsg.set('Invalid credentials. Default is admin@local/docuser');
        }
        this.loginForm.get('password')?.reset();
      }
    }
  }
}
