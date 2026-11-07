import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Inbox, LogOut, PawPrint, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { supabase } from '../lib/supabase';

export function Layout() {
  const { data: openCount = 0 } = useQuery({
    queryKey: ['alerts', 'open-count'],
    queryFn: async () => {
      const { count } = await supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'open');
      return count ?? 0;
    },
  });
  const { data: clinic } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await supabase.from('clinic_settings').select('clinic_name').eq('id', 1).single()).data,
  });

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 font-bold [&_svg]:shrink-0 ${isActive ? 'bg-scrub-soft text-scrub' : 'text-muted hover:text-ink'}`;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-4 md:block md:px-5 md:py-6">
          <p className="font-bold leading-tight">
            {clinic?.clinic_name ?? 'Clinic Companion'}
            <span className="block text-sm font-normal text-muted">Clinic Companion</span>
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 text-sm text-muted hover:text-ink md:hidden"
          >
            <LogOut size={16} aria-hidden /> Sign out
          </button>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3">
          <NavLink to="/" end className={link}>
            <Inbox size={18} aria-hidden />
            Needs attention
            {openCount > 0 && (
              <span className="ml-auto rounded-full bg-urgent px-2 text-sm text-paper" aria-label={`${openCount} open`}>
                {openCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/patients" className={link}>
            <PawPrint size={18} aria-hidden /> Patients
          </NavLink>
          <NavLink to="/scheduled" className={link}>
            <CalendarClock size={18} aria-hidden /> Scheduled messages
          </NavLink>
          <NavLink to="/settings" className={link}>
            <Settings size={18} aria-hidden /> Clinic settings
          </NavLink>
        </nav>
        <button
          onClick={() => supabase.auth.signOut()}
          className="absolute bottom-6 left-5 hidden items-center gap-2 text-sm text-muted hover:text-ink md:flex"
        >
          <LogOut size={16} aria-hidden /> Sign out
        </button>
      </aside>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-10 md:py-10">
        <Outlet />
      </main>
    </div>
  );
}
