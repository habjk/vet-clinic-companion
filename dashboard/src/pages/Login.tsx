import { useState } from 'react';
import { Button, ErrorNote } from '../components/ui';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form
        className="grid w-full max-w-sm gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match a staff account.' : error.message);
          setBusy(false);
        }}
      >
        <h1 className="text-[1.75rem] leading-tight font-bold">Clinic Companion</h1>
        <p className="-mt-2 text-muted">Sign in to see owner replies, patients and scheduled messages.</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <ErrorNote error={error} />}
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
