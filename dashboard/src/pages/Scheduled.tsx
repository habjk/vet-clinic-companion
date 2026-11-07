import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Empty, ErrorNote, Loading, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, kindLabel } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { ScheduledMessage } from '../lib/types';

const SELECT = 'id, kind, send_at, status, error, sent_at, pet_id, pets(name), owners(full_name)';

const statusText: Record<ScheduledMessage['status'], string> = {
  pending: 'Waiting to send',
  sending: 'Sending',
  sent: 'Sent',
  skipped: 'Not sent',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

export function Scheduled() {
  const qc = useQueryClient();
  const upcoming = useQuery({
    queryKey: ['scheduled', 'upcoming'],
    queryFn: async () => {
      const { data, error } = await supabase.from('scheduled_messages').select(SELECT).eq('status', 'pending').order('send_at').limit(100);
      if (error) throw error;
      return data as unknown as ScheduledMessage[];
    },
  });
  const recent = useQuery({
    queryKey: ['scheduled', 'recent'],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select(SELECT)
        .neq('status', 'pending')
        .gte('send_at', since)
        .order('send_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as ScheduledMessage[];
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_messages').update({ status: 'cancelled', error: 'Cancelled by staff' }).eq('id', id).eq('status', 'pending');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled'] }),
  });

  const sendNow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_messages').update({ send_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
      if (error) throw error;
      return api.runNow();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled'] }),
  });

  const runNow = useMutation({
    mutationFn: api.runNow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled'] });
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  return (
    <>
      <PageHeader
        title="Scheduled messages"
        intro="Reminders and check-ins go out automatically every 15 minutes, never during quiet hours. Cancel one here if it’s no longer needed."
        action={
          <Button onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            <Send size={18} aria-hidden /> {runNow.isPending ? 'Sending…' : 'Send due messages now'}
          </Button>
        }
      />
      <ErrorNote error={runNow.error ?? sendNow.error ?? cancel.error ?? upcoming.error ?? recent.error} />
      {(runNow.data ?? sendNow.data) && (
        <p className="mb-4 rounded-lg bg-scrub-soft px-3 py-2 text-scrub" role="status">
          {(() => {
            const r = (runNow.data ?? sendNow.data)!.result;
            return r.deferred === 'quiet hours'
              ? 'It’s quiet hours, so nothing was sent. Due messages will go out when quiet hours end.'
              : `Sent ${r.sent}, not needed ${r.skipped}, failed ${r.failed}.`;
          })()}
        </p>
      )}

      <h2 className="mb-3 text-[1.2rem] font-bold">Coming up</h2>
      {upcoming.isLoading && <Loading />}
      {upcoming.data?.length === 0 && <Empty>Nothing is scheduled. Logging a procedure or a vaccine coming due adds messages here.</Empty>}
      {upcoming.data && upcoming.data.length > 0 && (
        <Table
          rows={upcoming.data}
          action={(m) => (
            <span className="inline-flex gap-2">
              <Button onClick={() => sendNow.mutate(m.id)} disabled={sendNow.isPending}>
                Send now
              </Button>
              <Button variant="danger" onClick={() => cancel.mutate(m.id)}>
                Cancel
              </Button>
            </span>
          )}
        />
      )}

      <h2 className="mt-10 mb-3 text-[1.2rem] font-bold">Last 7 days</h2>
      {recent.data?.length === 0 && <Empty>No messages in the last week.</Empty>}
      {recent.data && recent.data.length > 0 && <Table rows={recent.data} />}
    </>
  );
}

function Table({ rows, action }: { rows: ScheduledMessage[]; action?: (m: ScheduledMessage) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[40rem] text-left">
        <thead className="border-b border-line text-sm text-muted">
          <tr>
            <th className="px-4 py-3 font-normal">When</th>
            <th className="px-4 py-3 font-normal">Message</th>
            <th className="px-4 py-3 font-normal">Pet and owner</th>
            <th className="px-4 py-3 font-normal">Status</th>
            {action && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3 whitespace-nowrap">{dateTime(m.send_at)}</td>
              <td className="px-4 py-3">{kindLabel[m.kind]}</td>
              <td className="px-4 py-3">
                {m.pet_id ? (
                  <Link to={`/pets/${m.pet_id}`} className="font-bold underline decoration-line underline-offset-4 hover:decoration-scrub">
                    {m.pets?.name}
                  </Link>
                ) : (
                  '—'
                )}
                <span className="block text-sm text-muted">{m.owners?.full_name}</span>
              </td>
              <td className="px-4 py-3">
                <span className={m.status === 'failed' ? 'font-bold text-urgent' : ''}>{statusText[m.status]}</span>
                {m.error && <span className="block text-sm text-muted">{m.error}</span>}
              </td>
              {action && <td className="px-4 py-3 text-right">{m.status === 'pending' && action(m)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
