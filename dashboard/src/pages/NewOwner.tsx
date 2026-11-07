import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, ErrorNote, PageHeader } from '../components/ui';
import { api } from '../lib/api';

export function NewOwner() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    preferredChannel: 'telegram',
    petName: '',
    species: 'Dog',
    breed: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () =>
      api.createOwner({
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        preferredChannel: form.preferredChannel,
        pet: { name: form.petName, species: form.species, breed: form.breed },
      }),
    onSuccess: (r) => navigate(`/pets/${r.petId}`),
  });

  return (
    <>
      <Link to="/patients" className="mb-4 inline-flex items-center gap-2 text-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> Patients
      </Link>
      <PageHeader
        title="Add owner and pet"
        intro="Contact details are encrypted before they’re saved. On the next screen you’ll get a QR code the owner scans to start receiving messages."
      />
      <form
        className="grid max-w-xl gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-[1.2rem] font-bold">Owner</legend>
          <label>
            Full name
            <input value={form.fullName} onChange={set('fullName')} required autoComplete="off" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Phone
              <input value={form.phone} onChange={set('phone')} type="tel" autoComplete="off" />
            </label>
            <label>
              Email
              <input value={form.email} onChange={set('email')} type="email" autoComplete="off" />
            </label>
          </div>
          <label>
            Send messages by
            <select value={form.preferredChannel} onChange={set('preferredChannel')}>
              <option value="telegram">Telegram (owner can reply)</option>
              <option value="email">Email (reminders only)</option>
            </select>
          </label>
        </fieldset>
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-[1.2rem] font-bold">Pet</legend>
          <label>
            Name
            <input value={form.petName} onChange={set('petName')} required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Species
              <select value={form.species} onChange={set('species')}>
                {['Dog', 'Cat', 'Rabbit', 'Bird', 'Guinea pig', 'Ferret', 'Reptile', 'Other'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Breed (optional)
              <input value={form.breed} onChange={set('breed')} />
            </label>
          </div>
        </fieldset>
        <ErrorNote error={create.error} />
        <div>
          <Button variant="primary" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add owner and pet'}
          </Button>
        </div>
      </form>
    </>
  );
}
