import { useEffect, useState, type ReactNode } from 'react'
import { ArrowClockwise, ArrowLeft, ArrowRight, CheckCircle, LockSimple, SignOut, Table } from '@phosphor-icons/react'
import { Button, Field, Input, Select, Shell } from '../../components/ui'
import { passwordError, usernameError } from '../../cloud/auth'
import { useSession } from '../../cloud/session'
import { listPublicSchools, requestAccount, type PublicSchool } from '../../cloud/signup'

function Frame({ children, title, intro }: { children: ReactNode; title: string; intro: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-[1100px] grid-cols-1 items-center gap-10 px-4 py-12 md:px-8 lg:grid-cols-12 lg:gap-16">
      <div className="animate-rise lg:col-span-6">
        <span aria-hidden className="mb-8 flex size-11 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Table weight="bold" className="text-xl" />
        </span>
        <h1 className="text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.03em] md:text-5xl">{title}</h1>
        <div className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-ink-2">{intro}</div>
      </div>
      <Shell className="animate-rise [animation-delay:100ms] lg:col-span-6">{children}</Shell>
    </main>
  )
}

export function LoadingScreen({ label = 'Opening Routine Builder…' }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-ink-2">
        <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
        {label}
      </div>
    </div>
  )
}

export function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'request' | 'sent'>('login')
  if (mode === 'request') return <RequestScreen onBack={() => setMode('login')} onSent={() => setMode('sent')} />
  if (mode === 'sent') return <RequestSentScreen onBack={() => setMode('login')} />
  return <SignInForm onRequest={() => setMode('request')} />
}

function SignInForm({ onRequest }: { onRequest: () => void }) {
  const signIn = useSession((s) => s.signIn)
  const message = useSession((s) => s.message)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter your user ID and password.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await signIn(username, password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Frame
      title="Sign in to Routine Builder"
      intro={<p>Your school’s teachers, classes and routine are saved to your account automatically. Ask your admin if you don’t have a user ID yet.</p>}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6 p-6 md:p-8">
        {message && <p role="status" className="rounded-core bg-warn-soft px-4 py-3 text-sm text-warn">{message}</p>}
        <Field label="User ID" htmlFor="login-user">
          <Input id="login-user" name="username" autoComplete="username" spellCheck={false} autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="login-pass">
          <Input id="login-pass" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <p aria-live="polite" className="-my-2 min-h-5 text-[13px] text-danger">{error}</p>
        <Button variant="primary" type="submit" disabled={busy} trailingIcon={<ArrowRight weight="bold" />} className="self-start">
          {busy ? 'Signing in…' : 'Sign In'}
        </Button>
        <p className="border-t border-line pt-5 text-[14px] text-ink-2">
          New teacher?{' '}
          <button type="button" onClick={onRequest} className="font-medium text-accent underline-offset-4 hover:underline">
            Request an account
          </button>
        </p>
      </form>
    </Frame>
  )
}

function RequestScreen({ onBack, onSent }: { onBack: () => void; onSent: () => void }) {
  const [schools, setSchools] = useState<PublicSchool[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listPublicSchools().then(setSchools).catch((e: Error) => setLoadError(e.message))
  }, [])

  const nErr = !name.trim() ? 'Enter your name so the admin knows who you are.' : undefined
  const uErr = usernameError(username)
  const pErr = passwordError(password)
  const cErr = confirm !== password ? 'The two passwords don’t match.' : undefined
  const sErr = !schoolId ? 'Choose your school.' : undefined

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    const first = nErr ? 'req-name' : sErr ? 'req-school' : uErr ? 'req-user' : pErr ? 'req-pass' : cErr ? 'req-confirm' : null
    if (first) {
      document.getElementById(first)?.focus()
      return
    }
    setBusy(true)
    setError(null)
    const err = await requestAccount({ displayName: name, username, password, schoolId })
    setBusy(false)
    if (err) setError(err)
    else onSent()
  }

  const noSchools = schools !== null && schools.length === 0
  return (
    <Frame
      title="Request an account"
      intro={<p>Pick your school and choose a user ID and password. Your admin checks the request and turns your account on. You can sign in after that.</p>}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6 p-6 md:p-8">
        <Field label="Your name" htmlFor="req-name" error={tried ? nErr : undefined}>
          <Input id="req-name" name="name" autoComplete="name" aria-invalid={tried && !!nErr} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="School"
          htmlFor="req-school"
          error={tried ? sErr : undefined}
          hint={loadError ?? (noSchools ? 'No schools have been added yet. Ask your admin to add yours first.' : undefined)}
        >
          <Select id="req-school" aria-invalid={tried && !!sErr} value={schoolId} disabled={!schools?.length} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">{schools === null && !loadError ? 'Loading schools…' : 'Choose your school'}</option>
            {schools?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="User ID" htmlFor="req-user" hint="Letters, numbers, dots, dashes or underscores. You’ll sign in with this." error={tried ? uErr : undefined}>
          <Input id="req-user" name="username" autoComplete="username" spellCheck={false} autoCapitalize="none" aria-invalid={tried && !!uErr} value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Password" htmlFor="req-pass" hint="At least 8 characters." error={tried ? pErr : undefined}>
            <Input id="req-pass" name="new-password" type="password" autoComplete="new-password" aria-invalid={tried && !!pErr} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Password again" htmlFor="req-confirm" error={tried ? cErr : undefined}>
            <Input id="req-confirm" name="confirm-password" type="password" autoComplete="new-password" aria-invalid={tried && !!cErr} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <p aria-live="polite" className="-my-2 min-h-5 text-[13px] text-danger">{error}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" type="submit" disabled={busy || noSchools} trailingIcon={<ArrowRight weight="bold" />}>
            {busy ? 'Sending…' : 'Send Request'}
          </Button>
          <Button variant="ghost" icon={<ArrowLeft weight="light" />} onClick={onBack}>Back to Sign In</Button>
        </div>
      </form>
    </Frame>
  )
}

function RequestSentScreen({ onBack }: { onBack: () => void }) {
  return (
    <Frame
      title="Request sent"
      intro={<p>Your admin will check it and turn your account on. Then sign in with the user ID and password you just chose.</p>}
    >
      <div className="flex flex-col items-start gap-5 p-6 md:p-8">
        <p className="flex items-start gap-3 text-[15px] text-ink-2">
          <CheckCircle aria-hidden weight="fill" className="mt-0.5 shrink-0 text-xl text-accent" />
          If it takes a while, remind your admin to look in the Admin tab under Waiting for approval.
        </p>
        <Button icon={<ArrowLeft weight="light" />} onClick={onBack}>Back to Sign In</Button>
      </div>
    </Frame>
  )
}

export function SetupScreen() {
  const setupAdmin = useSession((s) => s.setupAdmin)
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const uErr = usernameError(username)
  const pErr = passwordError(password)
  const cErr = confirm !== password ? 'The two passwords don’t match.' : undefined

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (uErr || pErr || cErr) {
      document.getElementById(uErr ? 'setup-user' : pErr ? 'setup-pass' : 'setup-confirm')?.focus()
      return
    }
    setBusy(true)
    setError(null)
    const err = await setupAdmin(username, name, password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Frame
      title="Create the admin account"
      intro={
        <>
          <p>This is the first time Routine Builder has been opened with this database. The account you create here manages everything: schools, users and the activity log.</p>
          <p className="mt-4 flex items-start gap-2 text-sm"><LockSimple aria-hidden weight="light" className="mt-0.5 shrink-0 text-lg text-accent" />This screen disappears once an admin exists. Everyone else signs in with an ID you create for them.</p>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6 p-6 md:p-8">
        <Field label="Your name" htmlFor="setup-name">
          <Input id="setup-name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="User ID" htmlFor="setup-user" hint="Letters, numbers, dots, dashes or underscores. You’ll sign in with this." error={tried ? uErr : undefined}>
          <Input id="setup-user" name="username" autoComplete="username" spellCheck={false} autoCapitalize="none" aria-invalid={tried && !!uErr} value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Password" htmlFor="setup-pass" hint="At least 8 characters." error={tried ? pErr : undefined}>
            <Input id="setup-pass" name="new-password" type="password" autoComplete="new-password" aria-invalid={tried && !!pErr} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Password again" htmlFor="setup-confirm" error={tried ? cErr : undefined}>
            <Input id="setup-confirm" name="confirm-password" type="password" autoComplete="new-password" aria-invalid={tried && !!cErr} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <p aria-live="polite" className="-my-2 min-h-5 text-[13px] text-danger">{error}</p>
        <Button variant="primary" type="submit" disabled={busy} trailingIcon={<ArrowRight weight="bold" />} className="self-start">
          {busy ? 'Creating…' : 'Create Admin Account'}
        </Button>
      </form>
    </Frame>
  )
}

export function NoSchoolScreen() {
  const profile = useSession((s) => s.profile)
  const signOut = useSession((s) => s.signOut)
  return (
    <Frame
      title={`Hello${profile?.display_name ? `, ${profile.display_name}` : ''}`}
      intro={<p>Your account isn’t linked to a school yet, so there is nothing to show. Ask the admin to assign you to your school, then sign in again.</p>}
    >
      <div className="flex flex-col items-start gap-4 p-6 md:p-8">
        <p className="text-[15px] text-ink-2">Signed in as <strong className="font-medium text-ink">{profile?.username}</strong>.</p>
        <Button icon={<SignOut weight="light" />} onClick={() => void signOut()}>Sign Out</Button>
      </div>
    </Frame>
  )
}

export function UnreachableScreen() {
  const init = useSession((s) => s.init)
  return (
    <Frame
      title="Can’t reach the server"
      intro={<p>Routine Builder couldn’t connect to where your school’s data is saved. Check your internet connection, then try again.</p>}
    >
      <div className="flex flex-col items-start gap-4 p-6 md:p-8">
        <p className="text-[15px] text-ink-2">Nothing has been lost. Your data is safe on the server.</p>
        <Button variant="primary" icon={<ArrowClockwise weight="bold" />} onClick={() => void init()}>Try Again</Button>
      </div>
    </Frame>
  )
}
