import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';

/**
 * Main application layout.
 * Specification: "Dashboard is calendar-first with NO navigation bar/sidebar. Header only has: title, search icon, dark-mode toggle, user avatar+name."
 */
export function AppLayout() {
  return (
    <div className="min-h-screen bg-surface-app flex flex-col transition-colors duration-200">
      <Header />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
