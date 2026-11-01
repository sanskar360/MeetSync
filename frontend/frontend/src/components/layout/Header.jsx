import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useIsPersonalAssistant } from '@/hooks/useUserRole';
import { getInitials } from '@/lib/utils';
import {
  Search,
  Sun,
  Moon,
  LogOut,
  CalendarDays,
} from 'lucide-react';

/**
 * App Header
 * Strict Specification: "Top header only: 'WORKSPACE / Dashboard', search icon (opens /assistant), theme toggle, avatar + user name. NO nav links or sidebar."
 */
export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { isPersonalAssistant } = useIsPersonalAssistant();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAssistant = location.pathname.startsWith('/assistant');
  const isMeeting = location.pathname.startsWith('/meetings');

  const displayName = user?.name || user?.full_name || 'User';
  const displayEmail = user?.email || '';
  const avatarUrl = user?.profile_picture || user?.avatar_url || null;

  return (
    <header className="sticky top-0 z-40 w-full bg-surface-card/85 backdrop-blur-md border-b border-border transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Title: WORKSPACE / Dashboard */}
        <div
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform shrink-0">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-1.5 text-xs sm:text-sm tracking-tight">
            <span className="font-bold uppercase tracking-wider text-content-muted group-hover:text-content-secondary transition-colors text-[11px] sm:text-xs">
              WORKSPACE
            </span>
            <span className="text-content-muted font-light">/</span>
            <span className="font-bold text-content-primary">
              {isAssistant ? 'Assistant' : isMeeting ? 'Meeting' : 'Dashboard'}
            </span>
          </div>
        </div>

        {/* Right Action Icons: Search Icon (Personal Assistant only), Dark-Mode Toggle, User Avatar + Name */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search Icon: Opens /assistant - Restricted strictly to Personal Assistants */}
          {isPersonalAssistant && (
            <button
              type="button"
              onClick={() => navigate('/assistant')}
              aria-label="Search meetings and past transcripts"
              title="Search & Archive (Personal Assistant)"
              className={`p-2 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                isAssistant
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-subtle'
              }`}
            >
              <Search className="w-5 h-5" />
            </button>
          )}

          {/* Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600" />
            )}
          </button>

          {/* User Avatar + Name */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2.5 pl-1.5 pr-2 py-1 rounded-xl hover:bg-surface-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-8 h-8 rounded-full object-cover border border-border shadow-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 font-bold text-xs flex items-center justify-center border border-primary/20">
                  {getInitials(displayName)}
                </div>
              )}
              <span className="hidden md:inline-block text-sm font-semibold text-content-primary">
                {displayName}
              </span>
            </button>

            {/* User Dropdown */}
            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-surface-card border border-border shadow-floating p-2 z-40 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-border-subtle mb-1">
                    <p className="text-sm font-bold text-content-primary truncate">
                      {displayName}
                    </p>
                    {displayEmail && (
                      <p className="text-xs text-content-muted truncate">
                        {displayEmail}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
