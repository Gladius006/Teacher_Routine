# Routine Builder: Product Spec (v1)

## Problem statement

Teachers who build the school routine by hand have to find, for every class and subject, a teacher with the right skills, avoid double-booking anyone, and try to leave each teacher a free period after teaching, because taking a class is more tiring than attending one. Doing this on paper for a whole school takes days, and one late change (a teacher leaves, a subject gets an extra period) can undo much of the work. Junior classes (5 to 7) make it harder to reason about, because almost any teacher can take them, so there are many valid choices and no obvious one.

## Goals

1. A complete, clash-free weekly routine for the whole school comes out of one "Generate" click in under 10 seconds for a school of up to 40 class sections and 60 teachers.
2. Every senior-class lesson is taught by a teacher who has that subject as a primary or secondary skill. Zero exceptions.
3. Teachers get a rest period after a class wherever the numbers allow it. The app reports every place it could not, so the routine-maker can see the cost.
4. Workload is visibly balanced. The routine-maker can see each teacher's periods per day and week at a glance.
5. After entering data once, a routine-maker can regenerate after a change in minutes, not days.

## Non-goals (v1)

- **Accounts, logins, a server.** The app runs in the browser and data stays on the device. That is enough for one routine-maker per school and removes hosting and privacy concerns.
- **Rooms and labs.** Room allocation is a separate problem. It is a P2 item, and the data model leaves space for it.
- **Substitution on the day** (a teacher is absent today). Useful, but a different workflow from building the weekly routine.
- **Multi-week or rotating routines.** Most schools use one weekly routine.
- **Syncing with school management systems.** JSON import/export covers backup and sharing for now.

## Users

- **Routine-maker** (usually a senior teacher or vice-principal): enters the data, generates, adjusts and prints.
- **Teacher**: reads their own routine and checks their load.

## User stories

Routine-maker
- As a routine-maker, I want to set the number of working days, periods per day and where the lunch break falls, so the routine matches my school's bell schedule.
- As a routine-maker, I want to add teachers with their main subjects and the extra subjects they can also teach, so the app picks suitable teachers.
- As a routine-maker, I want to add classes and sections with how many periods each subject gets per week, so every class gets its full curriculum.
- As a routine-maker, I want junior classes to be open to any teacher, while still preferring a teacher who knows the subject, so I have flexibility without losing quality.
- As a routine-maker, I want the app to give teachers a rest period after teaching whenever it can, so nobody teaches back-to-back all day.
- As a routine-maker, I want to fix who teaches a subject in a particular class before generating (for example, the class teacher takes English), so the app respects decisions already made.
- As a routine-maker, I want clear warnings when my inputs are impossible (for example, a class needs more periods than exist in a week, or no teacher can teach Class 11 Physics), so I can fix the data instead of getting a broken routine.
- As a routine-maker, I want to see the routine by class and by teacher, so I can check it from both sides.
- As a routine-maker, I want to print the routine, so I can put it on the notice board.
- As a routine-maker, I want my data saved automatically and exportable as a file, so I don't lose work and can move it to another computer.

Teacher
- As a teacher, I want to see my weekly routine with my free periods marked, so I know when I teach and when I rest.

## Requirements

### P0: must have

**R1. School settings.** Working days (1 to 7, default Mon to Sat), periods per day (1 to 12, default 8), a lunch break after period N (default 4, can be switched off), and the junior class cut-off (default: grades 7 and below are junior). Also the limits: maximum periods per day for one subject in one class (default 2) and default maximum teaching periods per day per teacher (default 6).
- [ ] Changing settings keeps existing teachers and classes. It only invalidates the generated routine.

**R2. Subjects.** A list of subjects, each with a name, a short code (2 to 4 letters) and a color.
- [ ] A subject that is still used by a teacher or class cannot be deleted without a warning that lists where it is used.

**R3. Teachers.** Each teacher has a name, a short code, primary subjects (their main field), secondary subjects (extra specialisations), and a maximum number of periods per day and per week.
- [ ] A teacher must have at least one subject. Primary and secondary cannot overlap.

**R4. Classes.** A class has a grade (number), a section (e.g. "A") and a curriculum: a list of subjects with periods per week.
- [ ] The editor shows "used X of Y slots" and warns when X exceeds Y (days × periods per day).
- [ ] Copying a class's curriculum to other sections of the same grade takes one action.

**R5. Teacher assignment rules.** Each (class, subject) pair is taught by one teacher for the whole week.
- Senior classes: only teachers with the subject as a primary or secondary skill. Primary is preferred.
- Junior classes: any teacher may be chosen. Preference order: primary skill, then secondary skill, then any teacher.
- The routine-maker can pin a teacher to a (class, subject) pair. The app never changes a pin, and if the pin breaks a hard rule it warns before generating.
- Weekly load never exceeds a teacher's weekly maximum.

**R6. Timetable rules.**
Hard rules, which the generated routine never breaks:
- a teacher is in only one class at a time;
- a class has only one lesson at a time;
- every curriculum period is placed (or, if that is impossible, reported as unplaced);
- teacher daily and weekly maximums are respected.

Soft rules, which the app tries hard to satisfy and reports when it can't:
- **rest rule**: after teaching a period, the teacher's next period is free. The lunch break counts as rest;
- a subject appears in a class at most the configured number of times per day;
- a class's free periods (if its curriculum is smaller than the week) go at the end of the day, not in the middle;
- each teacher's load is spread evenly across the days.

**R7. Generate.** A single "Generate routine" action runs without freezing the page and shows progress. A "Try again" action produces a different valid routine.
- [ ] A realistic school (about 20 sections, 30 teachers, 8×6 grid) generates in under 10 seconds on a normal laptop.
- [ ] If the inputs are infeasible, generation still returns the best routine it found plus a plain-language list of problems.

**R8. Views.**
- By class: a days × periods grid showing subject and teacher code.
- By teacher: a days × periods grid showing class and subject. Back-to-back periods (no rest) are highlighted.
- An issues panel lists every rest missed, overloaded day and unplaced lesson, and each entry links to the cell.

**R9. Workload.** Periods per teacher per day (heatmap), each teacher's total against their maximum, and the count of rest breaks given versus missed.

**R10. Persistence.** Data is saved automatically in the browser (localStorage). JSON export/import. "Load sample school" to try the app in one click.

**R11. Print.** A print-friendly layout for each class routine and each teacher routine, one per page.

### P1: nice to have
- Manual edits after generating: swap two cells in a class grid, with instant checks for clashes and rest violations.
- Lock cells so "Try again" keeps them.
- Teacher unavailability (e.g. "not in on Saturday", "no period 1 on Monday").
- CSV/Excel export.
- Double periods (labs) placed back-to-back on purpose.

### P2: future
- Rooms and labs as a resource.
- Daily substitution helper.
- Shared access for many staff (would need a backend).
- Sending each teacher their routine by WhatsApp or email.

## Success metrics
- Leading: a full routine generated in the first session for more than 80% of schools that enter their data; zero hard-rule violations in any generated routine (enforced by automated tests); rest rule met for at least 95% of lessons when the inputs allow it.
- Lagging: time to produce the term routine falls from days to under one hour; the routine-maker makes fewer than 10 manual changes after generating.

## Open questions
- (Stakeholder, non-blocking) Does the lunch break count as rest? **Assumption: yes.**
- (Stakeholder, non-blocking) Should non-academic periods (library, games) be scheduled? **Assumption: yes. Add them as subjects with a teacher.**
- (Stakeholder, non-blocking) Does "rest after class" apply before the first period of the day? **Assumption: no. Only the period right after teaching counts.**
- (Stakeholder, non-blocking) Does any school need two teachers in one class at once (combined sections, optional subjects)? **Out of scope for v1.**

## Phasing
1. Data entry, settings and persistence (R1 to R4, R10)
2. Scheduler engine with tests (R5 to R7)
3. Routine views, issues, workload and print (R8, R9, R11)
4. P1 items, based on feedback
