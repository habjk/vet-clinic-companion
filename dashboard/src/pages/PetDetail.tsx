import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Button, Empty, ErrorNote, Loading } from '../components/ui';
import { dateOnly, dateTime, kindLabel, telegramLink, todayIso } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Message, Pet, ScheduledMessage } from '../lib/types';

const PROCEDURES = ['Spay', 'Neuter', 'Dental cleaning', 'Tooth extraction', 'Mass removal', 'Wound repair'];

export function PetDetail() {
  const { id } = useParams();
  const pet = useQuery({
    queryKey: ['pet', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pets')
        .select('id, name, species, breed, owner_id, owners(*), vaccinations(id, vaccine, due_on, given_on, completed)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as unknown as Pet;
    },
  });

  if (pet.isLoading) return <Loading />;
  if (pet.error || !pet.data) return <ErrorNote error={pet.error ?? 'Pet not found.'} />;
  const p = pet.data;

  return (
    <>
      <Link to="/patients" className="mb-4 inline-flex items-center gap-2 text-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> Patients
      </Link>
      <header className="mb-8">
        <h1 className="text-[2rem] leading-tight font-bold">{p.name}</h1>
        <p className="text-muted">
          {[p.species, p.breed].filter(Boolean).join(', ')}. Owner: {p.owners.full_name}
        </p>
      </header>
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-8">
          <ProcedureForm pet={p} />
          <Vaccines pet={p} />
          <Conversation ownerId={p.owner_id} />
        </div>
        <OwnerPanel pet={p} />
      </div>
    </>
  );
}

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 md:p-6">
      <h2 className="text-[1.2rem] font-bold">{title}</h2>
      {intro && <p className="mt-1 max-w-[65ch] text-muted">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProcedureForm({ pet }: { pet: Pet }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState(PROCEDURES[0]);
  const [other, setOther] = useState('');
  const scheduled = useQuery({
    queryKey: ['scheduled', 'pet', pet.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('id, kind, send_at, status, error, sent_at, pet_id, pets(name), owners(full_name)')
        .eq('pet_id', pet.id)
        .in('status', ['pending', 'sending'])
        .order('send_at');
      if (error) throw error;
      return data as unknown as ScheduledMessage[];
    },
  });
  const log = useMutation({
    mutationFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const { error } = await supabase
        .from('procedures')
        .insert({ pet_id: pet.id, kind: kind === 'Other' ? other.trim() : kind, created_by: s.session?.user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      setOther('');
      qc.invalidateQueries({ queryKey: ['scheduled'] });
    },
  });

  return (
    <Section
      title="Log a procedure"
      intro={`The owner gets check-in messages at 10am the day after and three days after. Their replies are sorted by urgency and anything worrying appears in Needs attention.`}
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          log.mutate();
        }}
      >
        <label className="w-56">
          Procedure
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {[...PROCEDURES, 'Other'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        {kind === 'Other' && (
          <label className="w-56">
            Procedure name
            <input value={other} onChange={(e) => setOther(e.target.value)} required />
          </label>
        )}
        <Button variant="primary" type="submit" disabled={log.isPending}>
          {log.isPending ? 'Saving…' : 'Log procedure'}
        </Button>
      </form>
      <ErrorNote error={log.error} />
      {log.isSuccess && <p className="mt-3 text-scrub">Procedure logged. Check-ins are scheduled below.</p>}
      {scheduled.data && scheduled.data.length > 0 && (
        <>
        <h3 className="mt-5 text-sm text-muted">Check-ins already scheduled</h3>
        <ul className="mt-1 grid gap-1 text-sm">
          {scheduled.data.map((m) => (
            <li key={m.id}>
              <span className="font-bold">{kindLabel[m.kind]}</span> <span className="text-muted">{dateTime(m.send_at)}</span>
            </li>
          ))}
        </ul>
        </>
      )}
    </Section>
  );
}

function Vaccines({ pet }: { pet: Pet }) {
  const qc = useQueryClient();
  const today = todayIso();
  const record = useMutation({
    mutationFn: async (v: Pet['vaccinations'][number]) => {
      const next = new Date();
      next.setFullYear(next.getFullYear() + 1);
      const done = await supabase.from('vaccinations').update({ completed: true, given_on: today }).eq('id', v.id);
      if (done.error) throw done.error;
      const add = await supabase
        .from('vaccinations')
        .insert({ pet_id: pet.id, vaccine: v.vaccine, due_on: next.toISOString().slice(0, 10) });
      if (add.error) throw add.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pet', pet.id] });
      qc.invalidateQueries({ queryKey: ['pets'] });
    },
  });
  const due = pet.vaccinations.filter((v) => !v.completed).sort((a, b) => a.due_on.localeCompare(b.due_on));

  return (
    <Section title="Vaccines due" intro="Owners get a reminder two weeks before the due date and one follow-up a week later if it hasn't been given.">
      {due.length === 0 ? (
        <p className="text-muted">No vaccines are due.</p>
      ) : (
        <ul className="divide-y divide-line">
          {due.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <p>
                <span className="font-bold">{v.vaccine}</span>
                <span className={`block text-sm ${v.due_on < today ? 'font-bold text-urgent' : 'text-muted'}`}>
                  {v.due_on < today ? 'Overdue since ' : 'Due '}
                  {dateOnly(v.due_on)}
                </span>
              </p>
              <Button onClick={() => record.mutate(v)} disabled={record.isPending}>
                Record as given today
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={record.error} />
    </Section>
  );
}

function Conversation({ ownerId }: { ownerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['messages', ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, direction, body, photo_path, created_at')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as Message[]).reverse();
    },
  });
  return (
    <Section title="Messages with the owner">
      {isLoading && <Loading />}
      {data?.length === 0 && <Empty>No messages yet.</Empty>}
      <ol className="grid gap-3">
        {data?.map((m) => (
          <li key={m.id} className={`max-w-[85%] ${m.direction === 'inbound' ? '' : 'ml-auto text-right'}`}>
            <p
              className={`inline-block rounded-xl px-4 py-2.5 text-left ${
                m.direction === 'inbound' ? 'bg-paper' : 'bg-scrub-soft'
              }`}
            >
              {m.body ?? <span className="text-muted">Photo</span>}
            </p>
            <p className="mt-1 text-xs text-muted">
              {m.direction === 'inbound' ? 'Owner' : 'Clinic'}, {dateTime(m.created_at)}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function OwnerPanel({ pet }: { pet: Pet }) {
  const o = pet.owners;
  const link = telegramLink(o.telegram_link_token);
  const connected = o.opted_in && !!o.telegram_chat_id;
  const [copied, setCopied] = useState(false);
  return (
    <aside className="h-fit rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-10">
      <h2 className="font-bold">{o.full_name}</h2>
      <p className="mt-1">
        <ConnectionStatus owner={o} />
      </p>
      {!connected && !o.opted_out_at && (
        <>
          <p className="mt-4 text-sm text-muted">
            Ask the owner to scan this code with their phone camera. It opens the clinic’s Telegram chat and connects them.
          </p>
          <div className="mt-4 w-fit rounded-lg bg-white p-3">
            <QRCodeSVG value={link} size={176} aria-label="QR code to connect on Telegram" />
          </div>
          <Button
            className="mt-3 w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? 'Link copied' : 'Copy link to send by email'}
          </Button>
        </>
      )}
      {o.opted_out_at && (
        <p className="mt-4 text-sm text-muted">
          The owner replied STOP on {dateOnly(o.opted_out_at.slice(0, 10))}. They won’t get messages unless they send /start.
        </p>
      )}
    </aside>
  );
}
