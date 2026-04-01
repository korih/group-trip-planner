import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * This page handles the Google OAuth callback redirect.
 * The actual callback is processed server-side by GET /auth/google/callback,
 * which sets the session cookie and redirects to /dashboard.
 *
 * This page is only shown briefly if there's a client-side redirect mid-flow.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Should not normally land here — redirect to dashboard
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-sm text-gray-500">Signing you in…</p>
      </div>
    </div>
  );
}
