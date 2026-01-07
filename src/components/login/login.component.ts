
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styles: []
})
export class LoginComponent {
  authService = inject(AuthService);
  fb = inject(FormBuilder);
  
  errorMsg = signal('');

  loginForm = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required]
  });

  onSubmit() {
    if (this.loginForm.valid) {
      const { username, password } = this.loginForm.value;
      const success = this.authService.login(username!, password!);
      
      if (!success) {
        this.errorMsg.set('Invalid credentials. Default is docuser/docuser');
        this.loginForm.get('password')?.reset();
      }
    }
  }
}
