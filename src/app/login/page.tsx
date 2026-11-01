import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-sm font-semibold text-white">HQ</span>
          <h1 className="text-xl font-semibold">Creator HQ</h1>
          <p className="text-sm text-slate-500">Log in to your workspace</p>
        </div>
        <div className="card p-5">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
