import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function LandingPage() {
  const { user, isLoading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already signed in
  useEffect(() => {
    if (!isLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, isLoading, navigate]);

  const searchParams = new URLSearchParams(window.location.search);
  const error = searchParams.get('error');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo / Icon */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-3xl shadow-lg">
            ✈️
          </div>
        </div>

        <h1 className="mb-2 text-4xl font-bold tracking-tight text-gray-900">
          Group Trip Planner
        </h1>
        <p className="mb-8 text-lg text-gray-500">
          Plan trips with friends. Live maps, budgets, packing lists, and more.
        </p>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {getErrorMessage(error)}
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:shadow-md disabled:opacity-50"
        >
          <GoogleIcon />
          Sign in with Google
        </button>

        <p className="mt-6 text-xs text-gray-400">
          Create an account to plan trips. Invite friends without an account via link.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
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
  );
}

function getErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    oauth_failed: 'Sign in failed. Please try again.',
    invalid_state: 'Session expired. Please try again.',
    token_exchange_failed: 'Could not complete sign in. Please try again.',
    user_creation_failed: 'Could not create account. Please try again.',
  };
  return messages[error] ?? 'Something went wrong. Please try again.';
}
