import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { emptySchool } from '../engine/sample'
import type { ClassSection, Id, Routine, SchoolData, Settings, Subject, Teacher } from '../engine/types'

export type ThemePref = 'system' | 'light' | 'dark'

interface State {
  data: SchoolData
  routine: Routine | null
  theme: ThemePref
  started: boolean

  setSettings: (patch: Partial<Settings>) => void
  upsertSubject: (s: Subject) => void
  removeSubject: (id: Id) => void
  upsertTeacher: (t: Teacher) => void
  removeTeacher: (id: Id) => void
  upsertClass: (c: ClassSection) => void
  removeClass: (id: Id) => void
  copyCurriculum: (fromId: Id, toIds: Id[]) => void
  replaceData: (data: SchoolData) => void
  setRoutine: (r: Routine | null) => void
  setTheme: (t: ThemePref) => void
}

const upsert = <T extends { id: Id }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

export const useStore = create<State>()(
  persist(
    (set) => ({
      data: emptySchool(),
      routine: null,
      theme: 'system',
      started: false,

      setSettings: (patch) =>
        set((s) => {
          const settings = { ...s.data.settings, ...patch }
          // A routine built for a different grid shape can no longer be shown.
          const reshaped = settings.periodsPerDay !== s.data.settings.periodsPerDay || settings.dayNames.length !== s.data.settings.dayNames.length
          return { data: { ...s.data, settings }, routine: reshaped ? null : s.routine }
        }),

      upsertSubject: (subject) => set((s) => ({ data: { ...s.data, subjects: upsert(s.data.subjects, subject) } })),
      removeSubject: (id) =>
        set((s) => ({
          data: {
            ...s.data,
            subjects: s.data.subjects.filter((x) => x.id !== id),
            teachers: s.data.teachers.map((t) => ({
              ...t, primary: t.primary.filter((x) => x !== id), secondary: t.secondary.filter((x) => x !== id),
            })),
            classes: s.data.classes.map((c) => ({ ...c, curriculum: c.curriculum.filter((i) => i.subjectId !== id) })),
          },
        })),

      upsertTeacher: (teacher) => set((s) => ({ data: { ...s.data, teachers: upsert(s.data.teachers, teacher) } })),
      removeTeacher: (id) =>
        set((s) => ({
          data: {
            ...s.data,
            teachers: s.data.teachers.filter((x) => x.id !== id),
            classes: s.data.classes.map((c) => ({
              ...c,
              curriculum: c.curriculum.map((i) => (i.pinnedTeacherId === id ? { ...i, pinnedTeacherId: null } : i)),
            })),
          },
        })),

      upsertClass: (cls) => set((s) => ({ data: { ...s.data, classes: upsert(s.data.classes, cls) } })),
      removeClass: (id) => set((s) => ({ data: { ...s.data, classes: s.data.classes.filter((x) => x.id !== id) } })),
      copyCurriculum: (fromId, toIds) =>
        set((s) => {
          const from = s.data.classes.find((c) => c.id === fromId)
          if (!from) return s
          // Pins are per section, so they are not copied.
          const curriculum = from.curriculum.map(({ subjectId, periods }) => ({ subjectId, periods }))
          return {
            data: { ...s.data, classes: s.data.classes.map((c) => (toIds.includes(c.id) ? { ...c, curriculum } : c)) },
          }
        }),

      replaceData: (data) => set({ data, routine: null, started: true }),
      setRoutine: (routine) => set({ routine, started: true }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'routine-builder', version: 1 },
  ),
)

export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`
