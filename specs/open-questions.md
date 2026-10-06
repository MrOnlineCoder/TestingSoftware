# Open Questions

All questions below were answered on 2026-10-06 and the decisions are applied to `api-contract.md`,
`backend-plan.md`, `frontend-plan.md` and `ocr-plan.md`. Implementing agents: treat these as final.

| # | Question | Decision |
|---|---|---|
| Q1 | Multiple-choice scoring | **Partial credit**: `score × max(0, (correctSelected − wrongSelected) / totalCorrect)`, rounded to 2 decimals. `isCorrect` only when full score. |
| Q2 | Free-text answers | **Never auto-checked.** Stored, shown to the teacher, graded manually in session details (score input). Count as 0 until graded, included in max score. |
| Q3 | Deleting a suite with finished sessions | **Allowed**; sessions are kept (they snapshot the questions), `collectionId` becomes null, old title stays. Suites with active sessions cannot be deleted. |
| Q4 | "See correct answer immediately" | **Lock the answer on save**; viewing earlier questions still allowed if navigation is on. |
| Q5 | Blank answer sheet content | **Choice questions only.** Bubbles and question numbers, almost no text. Number and free-text questions are answered on the questions sheet; the teacher types number answers into the scan review table (auto-graded), grades free text manually. |
| Q6 | Multi-page answer sheets | **Single A4 page only**; API returns an error if the suite does not fit. |
| Q7 | Scan input format | **PNG/JPEG only.** |
| Q8 | Detection sensitivity | **Fixed thresholds** + manual correction in the review table. |
| Q9 | Offline exam reuse | **Reuse** latest printable version if the suite is unchanged since; otherwise create a new one. |
| Q10 | Student entry page | **None.** Only `/exam/{id}` links work; `/student` shows a static info text. |
| Q11 | Timer expiry | **Instant server-side auto-submit**, no grace period, no teacher force-submit. |
| Q12 | Validation library | **TypeBox** (Fastify JSON schema + Swagger). |

## Open

None at the moment. Add new questions here as `**OPEN**` items during implementation.
