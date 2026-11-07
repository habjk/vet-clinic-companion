import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, ErrorNote, Loading, PageHeader } from '../components/ui';
import { supabase } from '../lib/supabase';
import type { ClinicSettings } from '../lib/types';

const hours = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString('en-US', { hour: 'numeric' });

export function Settings() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['settings', 'full'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clinic_settings').select('*').eq('id', 1).single();
      if (error) throw error;
      return data as ClinicSettings;
    },
  });
  const [form, setForm] = useState<ClinicSettings | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (s: ClinicSettings) => {
      const { on_duty_telegram_chat_id: _ignored, ...editable } = s;
      const { error } = await supabase.from('clinic_settings').update(editable).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  if (isLoading || !form) return error ? <ErrorNote error={error} /> : <Loading />;
  const text = (k: keyof ClinicSettings) => ({
    value: (form[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value || null }),
  });
  const hour = (k: 'open_hour' | 'close_hour' | 'quiet_start' | 'quiet_end') => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: Number(e.target.value) }),
  });

  return (
    <>
      <PageHeader title="Clinic settings" intro="These details appear in messages to owners, including what they’re told in an emergency." />
      <form
        className="grid max-w-2xl gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-[1.2rem] font-bold">Clinic</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Clinic name
              <input {...text('clinic_name')} required />
            </label>
            <label>
              Phone number owners should call
              <input {...text('clinic_phone')} required />
            </label>
          </div>
          <label>
            Online booking link (optional)
            <input {...text('booking_url')} type="url" placeholder="https://" />
          </label>
          <label>
            Time zone
            <input {...text('timezone')} required placeholder="America/New_York" />
          </label>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-2 text-[1.2rem] font-bold">Hours</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Opens
              <select {...hour('open_hour')}>{hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
            </label>
            <label>
              Closes
              <select {...hour('close_hour')}>{hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
            </label>
            <label>
              No messages to owners after
              <select {...hour('quiet_start')}>{hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
            </label>
            <label>
              Messages can start again at
              <select {...hour('quiet_end')}>{hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
            </label>
          </div>
          <p className="text-sm text-muted">Urgent replies are always answered straight away, even during quiet hours.</p>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-2 text-[1.2rem] font-bold">Emergency hospital</legend>
          <p className="-mt-2 text-sm text-muted">Where owners are sent when a reply looks urgent and the clinic is closed.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Name
              <input {...text('er_name')} />
            </label>
            <label>
              Phone
              <input {...text('er_phone')} />
            </label>
          </div>
          <label>
            Address
            <input {...text('er_address')} />
          </label>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[1.2rem] font-bold">On-call alerts</legend>
          <p>
            {form.on_duty_telegram_chat_id ? (
              <span className="text-scrub">An on-call phone is receiving urgent alerts.</span>
            ) : (
              <span className="text-urgent">No on-call phone is set up. Urgent replies only appear on this dashboard.</span>
            )}
          </p>
          <p className="text-sm text-muted">
            To receive alerts on a phone, open the clinic’s Telegram bot and send <code>/oncall</code> followed by the on-call code.
            The most recent phone to do this receives alerts.
          </p>
        </fieldset>

        <ErrorNote error={save.error} />
        <div className="flex items-center gap-3">
          <Button variant="primary" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {save.isSuccess && <span className="text-scrub" role="status">Settings saved</span>}
        </div>
      </form>
    </>
  );
}
