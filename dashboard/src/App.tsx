import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { useSession } from './lib/session';
import { configMissing } from './lib/supabase';
import { Login } from './pages/Login';
import { NewOwner } from './pages/NewOwner';
import { Patients } from './pages/Patients';
import { PetDetail } from './pages/PetDetail';
import { Queue } from './pages/Queue';
import { Scheduled } from './pages/Scheduled';
import { Settings } from './pages/Settings';

export function App() {
  const { session, loading } = useSession();

  if (configMissing) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-[1.75rem] font-bold">Almost there</h1>
        <p className="mt-2 text-muted">
          Copy <code>.env.example</code> to <code>.env</code> in the dashboard folder, fill in your Supabase URL and anon key, then restart the dev server.
        </p>
      </main>
    );
  }
  if (loading) return <main className="p-10"><Loading /></main>;
  if (!session) return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Queue />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/new" element={<NewOwner />} />
          <Route path="pets/:id" element={<PetDetail />} />
          <Route path="scheduled" element={<Scheduled />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
