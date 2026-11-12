# Design

The full design plan and screen mockups live in a design canvas (private link held by the project owner).
Decisions that shape the code:

- **Program day belongs to the student.** Students join any day and leave after 10 school days. A class is only a group
  for enrolling and cleaning up. See `programDay` in `src/lib/dates.ts`.
- **This app grades typing only.** Morning computer-applications work and the overall course grade stay in Blackboard.
  The typing grade is exported as CSV (`src/lib/exports.ts`); automatic grade return over LTI is planned.
- **Students see their grade as soon as it is computed.** There is no posting step.
- **Username-only student sign-in, no PIN, usable from home.** Stronger sign-in comes with the Blackboard launch.
- **Attendance is not tracked here.** The school's clock-in system is the official record.

## Typing grade
Accuracy 40% (average of the last 3 finished runs against the target), speed 30% (best WPM among finished runs against the target),
activities completed 30%. A run is *finished* when no errors are left and the answer was not shown; it counts toward the
grade even if accuracy was under 95%, so a student who is still learning is not graded as 0. Only *clean* runs (finished, 95% or
better) count as personal bests. Weights and targets are instructor settings. An override needs a written reason and is logged.
See `src/lib/grades.ts` and its tests.

## Theme
`src/styles/theme.css` is the single source of colors and fonts (cool gray ground, navy instructor chrome, a blue-teal
accent for Medical Assistant and plum for Pharmacy Tech via `data-track="rx"` on `<body>`). Status colors always
come with a word. `src/styles/app.css` holds component styles that use the theme variables.
