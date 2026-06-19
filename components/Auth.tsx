"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface AuthProps {
  onAuthSuccess: () => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      if (data.user) {
        onAuthSuccess();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-80">
        <div className="absolute left-[-120px] top-[-120px] h-72 w-72 rounded-full bg-cyan-200/70 blur-3xl" />
        <div className="absolute bottom-[-120px] right-[-80px] h-72 w-72 rounded-full bg-blue-200/70 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-[80vh] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="animate-rise-in hidden rounded-3xl border border-white/20 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-10 text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.8)] lg:block">
            <p className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Resume Tailor
            </p>
            <h1 className="font-display mb-4 text-4xl font-semibold leading-tight tracking-tight">
              Craft job-ready resumes with a cleaner, faster workflow
            </h1>
            <p className="max-w-md text-slate-200">
              Analyze any job description, tailor your resume instantly, and generate a polished output for each role.
            </p>
          </section>

          <section className="glass-panel animate-rise-in p-8 sm:p-10">
            <h2 className="font-display mb-2 text-3xl font-semibold tracking-tight text-slate-900">
              Welcome back
            </h2>
            <p className="mb-8 text-sm text-slate-600">Sign in to continue tailoring resumes.</p>

            <form onSubmit={handleSignIn} className="space-y-4">
              {error && <div className="alert-error">{error}</div>}

              <div>
                <label htmlFor="email" className="field-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input-shell"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="field-label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input-shell"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

