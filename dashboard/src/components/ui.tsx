import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'quiet' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-scrub text-paper hover:opacity-90',
  quiet: 'border border-line bg-surface text-ink hover:border-scrub',
  danger: 'border border-line bg-surface text-urgent hover:border-urgent',
};

export function Button({ variant = 'quiet', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-[0.95rem] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[60ch]">
        <h1 className="text-[1.75rem] leading-tight font-bold">{title}</h1>
        {intro && <p className="mt-1 text-muted">{intro}</p>}
      </div>
      {action}
    </header>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-urgent-soft px-3 py-2 text-urgent">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-muted">{children}</div>;
}

export function Loading() {
  return <p className="text-muted">Loading…</p>;
}
