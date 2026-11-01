"use client";

import { login } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";

export function LoginForm() {
  return (
    <ActionForm action={login} className="space-y-4">
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" autoComplete="email" required className="input" />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      <SubmitButton className="btn-primary w-full" pendingText="Logging in…">
        Log in
      </SubmitButton>
    </ActionForm>
  );
}
