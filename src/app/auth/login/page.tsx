"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    setLoading(true);
    setError("");

    if (mode === "signup") {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (err) {
        setError(err.message);
      } else {
        setMagicSent(true);
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        setError(err.message);
      } else {
        router.push("/");
        router.refresh();
      }
    }
    setLoading(false);
  }

  async function handleMagicLink() {
    if (!email) {
      setError("Enter your email first");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createClient();

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (err) {
      setError(err.message);
    } else {
      setMagicSent(true);
    }
    setLoading(false);
  }

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  if (magicSent) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5">
        <div className="w-[72px] h-[72px] rounded-full bg-accent-brand/15 flex items-center justify-center mb-6">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              stroke="var(--accent-brand)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className="text-[24px] font-extrabold mb-2">Check your email</h1>
        <p className="text-[14px] text-text-muted text-center">
          We sent a {mode === "signup" ? "confirmation" : "magic"} link to{" "}
          <span className="text-text-primary font-medium">{email}</span>
        </p>
        <button
          onClick={() => setMagicSent(false)}
          className="text-[14px] text-accent-brand font-medium mt-6"
        >
          Try another email
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col safe-top px-5 pb-8">
      <div className="flex-1 flex flex-col justify-center max-w-[360px] mx-auto w-full">
        <h1 className="text-[32px] font-extrabold tracking-[-0.6px] mb-1">
          Catalyst
        </h1>
        <p className="text-[15px] text-text-muted mb-8">
          {mode === "login"
            ? "Sign in to your account"
            : "Create your account"}
        </p>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          className="w-full h-[52px] rounded-[14px] border border-border-1 bg-surface-1 text-[15px] font-medium flex items-center justify-center gap-3 mb-4"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border-1" />
          <span className="text-[12px] text-text-faint">or</span>
          <div className="flex-1 h-px bg-border-1" />
        </div>

        <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-[52px] rounded-[14px] border border-border-1 bg-surface-1 px-4 text-[15px] text-text-primary placeholder:text-text-faint outline-none focus:border-accent-brand transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="h-[52px] rounded-[14px] border border-border-1 bg-surface-1 px-4 text-[15px] text-text-primary placeholder:text-text-faint outline-none focus:border-accent-brand transition-colors"
          />

          {error && (
            <p className="text-[13px] text-neg-red">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "h-[52px] rounded-[14px] font-bold text-[16px] transition-all",
              loading
                ? "bg-surface-2 text-text-faint cursor-not-allowed"
                : "bg-accent-brand text-white shadow-[0_8px_22px_rgba(232,116,59,0.28)]"
            )}
          >
            {loading
              ? "..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button
          onClick={handleMagicLink}
          className="text-[13px] text-accent-brand font-medium mt-3 text-center"
        >
          Send magic link instead
        </button>

        <div className="mt-6 text-center">
          <span className="text-[13px] text-text-muted">
            {mode === "login"
              ? "Don't have an account? "
              : "Already have an account? "}
          </span>
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
            }}
            className="text-[13px] text-accent-brand font-medium"
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-text-faint font-mono tracking-[0.5px] uppercase text-center">
        By continuing you agree to our Terms of Service
      </p>
    </div>
  );
}
