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
          <section className="animate-rise-in hidden rounded-3xl border border-white/70 bg-gradient-to-br from-slate-900 to-slate-800 p-10 text-white shadow-2xl lg:block">
            <p className="mb-4 inline-flex rounded-full border border-white/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Resume Tailor
            </p>
            <h1 className="mb-4 text-4xl font-semibold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              Craft job-ready resumes with a cleaner, faster workflow
            </h1>
            <p className="max-w-md text-slate-200">
              Analyze any job description, tailor your resume instantly, and generate a polished output for each role.
            </p>
          </section>

          <section className="glass-panel animate-rise-in p-8 sm:p-10">
            <h2 className="mb-2 text-3xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
              Welcome back
            </h2>
            <p className="mb-8 text-sm text-slate-600">
          Sign in to continue
            </p>

            <form onSubmit={handleSignIn} className="space-y-4">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
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
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
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

