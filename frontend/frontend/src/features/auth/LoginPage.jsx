import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import {
  CalendarDays,
  CheckCircle2,
  Users,
  ShieldCheck,
  ChevronRight,
  Sun,
  Moon,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithGoogle, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // If already authenticated, redirect to destination
  useEffect(() => {
    if (isAuthenticated && !isAuthLoading) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isAuthLoading, navigate, location]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMessage(null);
    try {
      await loginWithGoogle();
      // Browser redirected to authorization_url by AuthProvider
    } catch (err) {
      setErrorMessage(err.message || 'Failed to connect to Google OAuth service. Please try again.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-surface-app text-content-primary antialiased">
      {/* LEFT HERO: Dark Navy Panel matching reference screenshot */}
      <div className="w-full lg:w-[58%] bg-[#080d19] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        {/* Soft subtle radial ambient glow */}
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header: Brand Logo + Pill */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <CalendarDays className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              MeetSync
            </span>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#11192d] text-slate-300 border border-slate-800 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Built for focused teams</span>
          </div>
        </div>

        {/* Middle Hero Section */}
        <div className="relative z-10 my-auto py-10 space-y-10 max-w-xl">
          <div className="space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 block">
              YOUR MEETINGS, IN SYNC
            </span>

            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.12] text-white">
              Turn every meeting into<br />shared momentum
            </h1>

            <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-lg">
              Bring schedules, notes, transcripts, and decisions together in one clear workspace.
            </p>
          </div>

          {/* Three Feature Highlight Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {/* Feature 1 */}
            <div className="p-4 rounded-2xl bg-[#0f172a]/70 border border-slate-800/80 backdrop-blur-sm space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <CalendarDays className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-sm text-white">Connected Calendar</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sync automatically with Google Calendar so you are always prepped.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-4 rounded-2xl bg-[#0f172a]/70 border border-slate-800/80 backdrop-blur-sm space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-sm text-white">Decisions & Actions</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Capture notes and action items in real-time as discussions happen.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-4 rounded-2xl bg-[#0f172a]/70 border border-slate-800/80 backdrop-blur-sm space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-sm text-white">Clear Ownership</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Roles and responsibilities make follow-through obvious for everyone.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Social Proof */}
        <div className="relative z-10 pt-6 border-t border-slate-900/80 flex items-center gap-3 text-xs text-slate-400">
          <div className="flex -space-x-1.5 overflow-hidden">
            <span className="inline-block h-6 w-6 rounded-full ring-2 ring-[#080d19] bg-indigo-600 font-bold text-[10px] text-white flex items-center justify-center">
              JD
            </span>
            <span className="inline-block h-6 w-6 rounded-full ring-2 ring-[#080d19] bg-emerald-600 font-bold text-[10px] text-white flex items-center justify-center">
              SK
            </span>
            <span className="inline-block h-6 w-6 rounded-full ring-2 ring-[#080d19] bg-violet-600 font-bold text-[10px] text-white flex items-center justify-center">
              AM
            </span>
          </div>
          <span>Trusted by modern product, engineering, and leadership teams.</span>
        </div>
      </div>

      {/* RIGHT AUTH CARD: Clean Surface Container */}
      <div className="w-full lg:w-[42%] bg-surface-card p-8 sm:p-12 lg:p-16 flex flex-col justify-between">
        {/* Top Right Utilities */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-subtle transition-colors"
          >
            {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>
        </div>

        {/* Center Login Box */}
        <div className="my-auto max-w-sm w-full mx-auto space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-content-primary tracking-tight">
              Sign in to your account
            </h2>
            <p className="text-sm text-content-secondary leading-relaxed">
              Use your Google Workspace account to securely access your synced agendas, collaborative notes, and meeting intelligence.
            </p>
          </div>

          {/* Error notice if OAuth initialization fails */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Actions Container */}
          <div className="space-y-4 pt-2">
            {/* Primary Google Login Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full flex items-center justify-between py-3 px-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-sm shadow-xs hover:shadow-soft transition-all duration-150 group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {/* Official Google G Logo */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{googleLoading ? 'Redirecting to Google...' : 'Continue with Google'}</span>
              </div>
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              )}
            </button>
          </div>

          {/* Security notice with shield */}
          <div className="flex items-start gap-2 pt-2 text-xs text-content-secondary leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>Your account is protected by Google OAuth 2.0. MeetSync stores your session in a secure HttpOnly cookie.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-border flex items-center justify-between text-xs text-content-muted">
          <div className="flex items-center gap-3">
            <span className="hover:text-content-secondary cursor-pointer">Privacy</span>
            <span>•</span>
            <span className="hover:text-content-secondary cursor-pointer">Terms</span>
          </div>
          <span>© MeetSync</span>
        </div>
      </div>
    </div>
  );
}
