import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Button, Empty, ErrorNote, Loading, PageHeader } from '../components/ui';
import { dateOnly, todayIso } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Pet } from '../lib/types';

export function Patients() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['pets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pets')
        .select('id, name, species, breed, owner_id, owners(*), vaccinations(id, vaccine, due_on, given_on, completed)')
        .order('name');
      if (error) throw error;
      return data as unknown as Pet[];
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.owners.full_name.toLowerCase().includes(q));
  }, [data, search]);

  const today = todayIso();

  return (
    <>
      <PageHeader
        title="Patients"
        intro="Every pet, who owns them, and whether the owner gets messages from the clinic."
        action={
          <Button variant="primary" onClick={() => navigate('/patients/new')}>
            <Plus size={18} aria-hidden /> Add owner and pet
          </Button>
        }
      />
      <label className="mb-5 max-w-sm">
        <span className="sr-only">Search patients</span>
        <span className="relative block">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
          <input className="pl-10!" placeholder="Search by pet or owner" value={search} onChange={(e) => setSearch(e.target.value)} />
        </span>
      </label>
      <ErrorNote error={error} />
      {isLoading && <Loading />}
      {data && rows.length === 0 && <Empty>{search ? 'No pets match that search.' : 'No patients yet. Add the first owner and pet to get started.'}</Empty>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="border-b border-line text-sm text-muted">
              <tr>
                <th className="px-4 py-3 font-normal">Pet</th>
                <th className="px-4 py-3 font-normal">Owner</th>
                <th className="px-4 py-3 font-normal">Messages</th>
                <th className="px-4 py-3 font-normal">Next vaccine</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const next = p.vaccinations.filter((v) => !v.completed).sort((a, b) => a.due_on.localeCompare(b.due_on))[0];
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link to={`/pets/${p.id}`} className="font-bold underline decoration-line underline-offset-4 hover:decoration-scrub">
                        {p.name}
                      </Link>
                      <span className="block text-sm text-muted">{[p.species, p.breed].filter(Boolean).join(', ')}</span>
                    </td>
                    <td className="px-4 py-3">{p.owners.full_name}</td>
                    <td className="px-4 py-3">
                      <ConnectionStatus owner={p.owners} />
                    </td>
                    <td className="px-4 py-3">
                      {next ? (
                        <span className={next.due_on < today ? 'font-bold text-urgent' : ''}>
                          {next.vaccine}, {next.due_on < today ? 'overdue since ' : ''}
                          {dateOnly(next.due_on)}
                        </span>
                      ) : (
                        <span className="text-muted">None due</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
