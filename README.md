# Routine Builder

A web app that builds a school's weekly routine. It matches teachers to subjects by skill, never double-books anyone, and gives teachers a free period after each class wherever the numbers allow.

- Senior classes only get teachers who have the subject as a **main** or **extra** skill.
- Junior classes (5 to 7 by default, adjustable) can go to any teacher. A teacher with the skill is still preferred.
- The lunch break counts as rest.
- You can pin a specific teacher to a class and subject; the rest is chosen automatically.
- Views by class, by teacher, and "who teaches what", plus a workload heatmap and print layouts.

Everything runs in the browser. Data is saved in the browser automatically; use **School > Download Backup** to move it between computers.

## Run it

Needs Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and choose **Try a Sample School** to see it working.

```bash
npm test          # scheduler and store tests
npm run build     # production build in dist/
```

`dist/` is a static site. It can be hosted anywhere (Netlify, GitHub Pages, a school server) or opened with `npm run preview`.

## How it works

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short: teachers are first assigned to each class and subject (most constrained first, preferring main skills and keeping everyone's load low enough to allow rest). Then a simulated-annealing search arranges the periods to remove clashes and back-to-back classes. It runs in a Web Worker and takes about a second for a 14-section school.

- Spec: [docs/SPEC.md](docs/SPEC.md)
- Test plan: [docs/TESTING.md](docs/TESTING.md)
