"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="mx-auto w-full max-w-md">
        <div className="glass-panel overflow-hidden">
          <div className="page-header">
            <h2 className="page-title">Change password</h2>
            <p className="page-subtitle">Update your account password</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {message && <div className="alert-success">{message}</div>}
            {error && <div className="alert-error">{error}</div>}
            <div>
              <label htmlFor="new-password" className="field-label">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-shell"
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="field-label">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-shell"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Link href="/profile" className="btn-soft">
                Cancel
              </Link>
              <button type="submit" disabled={saving} className="btn-primary px-4 py-2">
                {saving ? "Saving…" : "Update password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
