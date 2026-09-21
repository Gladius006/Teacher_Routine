# Turning on sign-in and cloud saving

Without this setup the site works in offline mode: data is saved only in each person's browser. After it, everyone signs in, each school's data autosaves to a database, and the admin gets a dashboard.

It uses [Supabase](https://supabase.com) (free plan is enough for a school).

## 1. Create the Supabase project (you)

1. Sign up at https://supabase.com and click **New project**. Choose a name (e.g. `teacher-routine`), a strong database password (keep it somewhere safe), and the region closest to you (e.g. Mumbai).
2. When it's ready, open **Project Settings → API** (or **Connect**) and copy:
   - **Project URL**, like `https://abcdxyz.supabase.co`
   - **Publishable key** (or the legacy **anon public** key). This key is designed to be public; the database rules decide what each person can see.
3. In **Authentication → Sign In / Providers → Email**, turn **off** "Confirm email". (Accounts are created by the admin with user IDs, not real email addresses.)
4. In **Authentication → Sign In / Providers**, turn **off** "Allow new users to sign up". Only the admin creates accounts.

## 2. Create the tables and the account function

Either give Claude a Supabase **access token** (Account → Access Tokens) to do this for you, or do it yourself:

**Database:** open **SQL Editor → New query**, paste all of `supabase/migrations/0001_init.sql`, and click **Run**.

**Account function:** in a terminal in this project folder:

```bash
npx supabase login
npx supabase functions deploy admin-users --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

`YOUR_PROJECT_REF` is the `abcdxyz` part of the project URL.

## 3. Connect the website

In the GitHub repository: **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Name | Value |
|---|---|
| `SUPABASE_URL` | the Project URL |
| `SUPABASE_ANON_KEY` | the publishable / anon key |

Then re-run the latest **Deploy to GitHub Pages** workflow (Actions tab), or push any change.

For local development, create `.env.local` with:

```
VITE_SUPABASE_URL=https://abcdxyz.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

## 4. First sign-in

Open the site. Because no admin exists yet, it asks you to **create the admin account** (your name, a user ID and a password). That screen never appears again.

Then, in the **Admin** tab:

1. **Add School** for each school.
2. **Add User** for each teacher: user ID, a starting password, their school, and role (Teacher or Admin).
3. Give each person their user ID and password.

## What each role can do

| | Teacher | Admin |
|---|---|---|
| Sign in | ✓ | ✓ |
| See and edit their own school | ✓ | ✓ (any school) |
| See other schools | | ✓ |
| Admin tab: users, schools, activity log | | ✓ |

These rules are enforced by the database itself (row-level security), not just by hiding buttons.

## What is recorded in the activity log

Sign-ins and sign-outs, each saved edit (and which parts changed: bell schedule, subjects, teachers, classes), routines generated, Excel exports, prints, backup downloads and uploads, loading the sample, clearing data, and every admin action (users created, passwords reset, users disabled or deleted, schools created, renamed or deleted).

## Good to know

- **Autosave:** changes save about a second after you stop editing. The top bar shows *Saving…*, *Saved*, or *Offline, retrying*.
- **Two people editing at once:** if someone else saved first, you see a message and can load their version. Nothing is overwritten silently.
- **Shared computers:** school data isn't stored in the browser in this mode, and signing out clears it from the screen.
- **Forgotten password:** the admin sets a new one from the Users table (key icon).
