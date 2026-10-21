import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ title, description, children }: { title?: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {description && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
      <div className={title || description ? 'mt-5' : undefined}>{children}</div>
    </section>
  );
}

const control =
  'block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ' +
  'focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-stone-700 dark:bg-stone-950';

type FieldProps = { label: string; error?: string | undefined; hint?: ReactNode };

export function Field({ label, error, hint, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input {...input} className={cx(control, 'mt-1', error && 'border-red-500')} />
      {hint && !error && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function TextArea({ label, error, ...input }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <textarea {...input} className={cx(control, 'mt-1', error && 'border-red-500')} />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const buttons = {
  primary: 'bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500/40',
  secondary:
    'border border-stone-300 bg-white hover:bg-stone-100 focus-visible:ring-stone-400/40 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/40',
  link: 'px-0 py-0 text-amber-700 underline-offset-4 hover:underline dark:text-amber-500',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: { variant?: keyof typeof buttons } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60',
        buttons[variant],
        className,
      )}
    />
  );
}

const tones = {
  info: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100',
  success: 'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100',
  error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
};

export function Alert({ tone = 'info', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-lg border px-4 py-3 text-sm', tones[tone])}>
      {children}
    </div>
  );
}

/** A narrow, centered page for sign-in and other account forms. */
export function AuthPage({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
      <div className="mt-6">{children}</div>
      {footer && <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">{footer}</p>}
    </div>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {action}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">
      {children}
    </span>
  );
}
