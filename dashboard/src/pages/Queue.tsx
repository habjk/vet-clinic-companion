import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff, PhoneCall } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Empty, ErrorNote, Loading, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Alert } from '../lib/types';

const SELECT =
  'id, urgency, source, summary, matched_terms, status, created_at, resolved_at, resolution_note, owner_id, pet_id, owners(full_name), pets(name, species), messages(body, photo_path)';

export function Queue() {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['alerts', showResolved ? 'resolved' : 'open'],
    queryFn: async () => {
      const q = supabase.from('alerts').select(SELECT).eq('status', showResolved ? 'resolved' : 'open');
      const { data, error } = showResolved
        ? await q.order('resolved_at', { ascending: false }).limit(50)
        : await q.order('created_at', { ascending: true });
      if (error) throw error;
      const rows = data as unknown as Alert[];
      // Urgent first; within each level, whoever has waited longest comes first.
      return showResolved ? rows : [...rows].sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === 'urgent' ? -1 : 1));
    },
  });

  // New replies appear the moment they arrive.
  useEffect(() => {
    const channel = supabase
      .channel('alerts-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () =>
        qc.invalidateQueries({ queryKey: ['alerts'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const openCount = showResolved ? 0 : (data?.length ?? 0);
  useEffect(() => {
    document.title = openCount ? `(${openCount}) Needs attention` : 'Clinic Companion';
  }, [openCount]);

  return (
    <>
      <PageHeader
        title="Needs attention"
        intro="Owner replies that need a person. Urgent ones are at the top; the on-call phone has already been alerted for those."
        action={
          <Button onClick={() => setShowResolved((v) => !v)}>{showResolved ? 'Show open replies' : 'Show resolved'}</Button>
        }
      />
      <ErrorNote error={error} />
      {isLoading && <Loading />}
      {data && data.length === 0 && (
        <Empty>
          {showResolved
            ? 'Nothing has been resolved yet.'
            : 'No replies need attention. Replies that need a call back will appear here as they arrive.'}
        </Empty>
      )}
      <ol className="grid gap-4">
        {data?.map((a) => (
          <li key={a.id}>
            <AlertCard alert={a} />
          </li>
        ))}
      </ol>
    </>
  );
}

function AlertCard({ alert: a }: { alert: Alert }) {
  const qc = useQueryClient();
  const urgent = a.urgency === 'urgent';
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');

  const contact = useMutation({ mutationFn: () => api.contact(a.owner_id) });
  const resolve = useMutation({
    mutationFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const { error } = await supabase
        .from('alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: s.session?.user.id,
          resolution_note: note || null,
        })
        .eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const words = a.messages?.body;

  return (
    <article
      className={`grid grid-cols-[6px_1fr] overflow-hidden rounded-xl border bg-surface ${urgent ? 'border-urgent/40' : 'border-line'}`}
      aria-label={`${urgent ? 'Urgent' : 'Call back'}: ${a.owners?.full_name ?? 'owner'}`}
    >
      <div className={urgent ? 'bg-urgent' : 'bg-callback'} aria-hidden />
      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className={`font-bold ${urgent ? 'text-urgent' : 'text-callback'}`}>{urgent ? 'Urgent' : 'Call back today'}</p>
          <p className="text-sm text-muted">
            <time dateTime={a.created_at}>{timeAgo(a.created_at)}</time>
          </p>
          {a.matched_terms.length > 0 && (
            <p className="text-sm text-muted">Red-flag words: {a.matched_terms.join(', ')}</p>
          )}
          {a.source === 'fallback' && <p className="text-sm text-muted">AI review was unavailable</p>}
        </div>

        <blockquote className="mt-3 max-w-[62ch] text-[1.35rem] leading-snug md:text-[1.5rem]">
          {words ? <>“{words}”</> : <span className="text-muted">The owner sent a photo without a message.</span>}
        </blockquote>

        {a.messages?.photo_path && <Photo path={a.messages.photo_path} />}

        {a.summary && <p className="mt-3 max-w-[70ch] text-muted">{a.summary}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4">
          <p>
            {a.pets ? (
              <Link to={`/pets/${a.pet_id}`} className="font-bold underline decoration-line underline-offset-4 hover:decoration-scrub">
                {a.pets.name}
              </Link>
            ) : (
              <span className="font-bold">Pet not identified</span>
            )}
            {a.pets && <span className="text-muted"> ({a.pets.species.toLowerCase()})</span>}
            <span className="block text-sm text-muted">{a.owners?.full_name}</span>
          </p>

          {a.status === 'open' ? (
            <div className="ml-auto flex flex-wrap gap-2">
              {contact.data?.phone ? (
                <a
                  href={`tel:${contact.data.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-scrub px-3.5 font-bold text-paper"
                >
                  <PhoneCall size={18} aria-hidden /> {contact.data.phone}
                </a>
              ) : (
                <Button variant={urgent ? 'primary' : 'quiet'} onClick={() => contact.mutate()} disabled={contact.isPending}>
                  <PhoneCall size={18} aria-hidden /> {contact.isPending ? 'Loading…' : 'Show phone number'}
                </Button>
              )}
              {!resolving && <Button onClick={() => setResolving(true)}>Mark as handled</Button>}
            </div>
          ) : (
            <p className="ml-auto text-sm text-muted">
              Handled {a.resolved_at && timeAgo(a.resolved_at)}
              {a.resolution_note && `: ${a.resolution_note}`}
            </p>
          )}
        </div>

        {contact.data && !contact.data.phone && <p className="mt-2 text-sm text-muted">No phone number on file.</p>}
        <ErrorNote error={contact.error ?? resolve.error} />

        {resolving && (
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              resolve.mutate();
            }}
          >
            <label className="min-w-[16rem] flex-1">
              What happened? (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called owner, booked recheck tomorrow" autoFocus />
            </label>
            <Button variant="primary" type="submit" disabled={resolve.isPending}>
              {resolve.isPending ? 'Saving…' : 'Mark as handled'}
            </Button>
            <Button type="button" onClick={() => setResolving(false)}>
              Cancel
            </Button>
          </form>
        )}
      </div>
    </article>
  );
}

function Photo({ path }: { path: string }) {
  const { data: url, isError } = useQuery({
    queryKey: ['photo', path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('photos').createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 50 * 60_000,
  });
  if (isError) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <ImageOff size={16} aria-hidden /> The photo could not be loaded.
      </p>
    );
  }
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-4 block w-fit">
      <img src={url} alt="Photo sent by the owner" className="max-h-64 rounded-lg border border-line object-cover" />
    </a>
  );
}
