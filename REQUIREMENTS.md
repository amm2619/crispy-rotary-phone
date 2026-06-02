# Software Requirements Specification — Records

**Document type:** Software Requirements Specification (SRS)
**Product:** Records — Timekeeping & Household App
**Owner:** Ash / Kara (federal-contractor household, "Nightwing")
**Status:** Living document — describes the system as built (`Records/index.html`)
**Source of truth for behavior:** `CLAUDE.md` + `Records/index.html`

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements for **Records**, a single-file web application that tracks work sessions, comp time, leave, and holidays against a biweekly federal pay-period target, plus auxiliary household features (fasting, weight-loss meal planning, birthdays). It is intended for the maintainers of the app and any future contributor.

### 1.2 Scope
Records is a **single-page, single-file HTML application** (`Records/index.html`) with an embedded JavaScript application and CSS. It runs entirely client-side in the browser, persists locally via `localStorage`, and optionally syncs a shared household document to Firebase Firestore. There is **no backend application server** of our own; the only external services are Google Fonts (styling), Firebase (auth + Firestore), and the Google Calendar API.

In scope:
- Timekeeping against an 80-hour biweekly target
- Comp-time banking, leave accrual, holiday handling (fixed + floating)
- WFH limit tracking
- Fasting-hours tracking
- Weight-loss meal/shopping planning (Ash + Kara, shared inventory)
- Birthdays
- Cloud sync + Google Calendar integration

Out of scope:
- Multi-tenant / general-public use (the app is hard-coded to one household)
- Payroll export, timesheet submission to an employer system
- Mobile native apps (responsive web only)

### 1.3 Definitions & Abbreviations
| Term | Meaning |
|------|---------|
| Pay period | A 14-day SAT–FRI cycle; the planning unit for the 80h target |
| Period target | Hours still owed in a period; starts at −80h, closes toward 0 |
| Contribution | Hours a day adds toward the target: `workHours + compUsed + leave + holiday` |
| Comp bank | All-time running balance of `sum(compEarned) − sum(compUsed)` |
| Fixed holiday | Always off; reduces the period target |
| Floating holiday | Credit-based; user chooses to work it or take it |
| Free floating | One per-year floating credit assignable to any day |
| WFH | Work-from-home session (`loc: 'wfh'`) |
| `D` | The in-memory application state object (persisted as `rec_v{N}`) |

### 1.4 References
- `CLAUDE.md` — authoritative behavioral spec and domain rules
- `Records/index.html` — the implementation
- `firestore.rules` — cloud-sync access control

---

## 2. Overall Description

### 2.1 Product Perspective
Records is a self-contained front-end app. State lives in a single object `D` persisted to `localStorage` under a versioned key (`rec_v{N}`). When signed in, the same `D` is mirrored to a single shared Firestore document at `households/{HOUSEHOLD_ID}/state/main`, enabling two users (Ash, Kara) to share one dataset in real time.

### 2.2 User Classes
- **Ash** — primary user; owns the timekeeping data. Should open the app first after a cloud cutover (seed guard).
- **Kara** — second household member; shares the same document via her own Google account.

Both users are co-equal readers/writers of the shared doc, gated by an explicit UID allowlist.

### 2.3 Operating Environment
- Modern evergreen browser (desktop + mobile responsive).
- Network required only for: Google Fonts, Firebase Auth/Firestore, Google Calendar. The app must remain usable offline against `localStorage` and queued Firestore writes.

### 2.4 Design & Implementation Constraints
- **C-1** Single canonical file: `Records/index.html`. No `records_vN.html` duplicates — git history is the version trail.
- **C-2** No build step; no external runtime dependencies except Google Fonts and the Firebase/GAPI CDNs.
- **C-3** `node --check` (syntax check) MUST pass on extracted JS before shipping.
- **C-4** Aesthetic: dark warm-amber theme, Inter + Playfair Display fonts.
- **C-5** Bump the `localStorage` key (`rec_v{N}` → `rec_v{N+1}`) **only when the data shape changes**, to drop stale caches.

### 2.5 Assumptions & Dependencies
- The household is a fixed two-person set; `HOUSEHOLD_ID = 'records-ash-kara'`.
- Pay-period anchor is `2025-08-23` (a Saturday), 35 total periods through end of 2026.
- Google Calendar access token comes from the Firebase sign-in popup and expires ~1h later.

---

## 3. Functional Requirements

### 3.1 Pay Period & Targets
- **FR-1.1** The system SHALL use a 14-day SAT–FRI pay period anchored at `payPeriodStart = 2025-08-23`.
- **FR-1.2** The period index SHALL be computed with **UTC day counting**, never millisecond subtraction, to avoid DST off-by-one errors:
  `days = round(toUTCDays(d) − toUTCDays(payPeriodStart)); idx = floor(days / 14)`.
- **FR-1.3** Each period SHALL start at a target of **−80h** and close toward 0 as contribution is logged. Each week within SHALL start at **−40h**.
- **FR-1.4** The system SHALL support periods P1 (2025-08-23) through period 35 (end of 2026).

### 3.2 Day Data & Contribution
- **FR-2.1** Each day SHALL be modeled as: `{ sessions[], compEarned, compUsed, leave, holiday, skip, notes, tags[] }`.
- **FR-2.2** A session SHALL be `{ id, start, end, loc, note }` with `start`/`end` as decimal hours and `loc ∈ {office, wfh}`.
- **FR-2.3** Work hours for a session SHALL be `end − start`, adding 24 if `end ≤ start` (overnight).
- **FR-2.4** A day's contribution toward the 80h target SHALL be `workHours + compUsed + leave + holiday`.
- **FR-2.5** `compEarned` SHALL NOT count toward the target; it banks into the comp bank only.
- **FR-2.6** A day with `skip: true` SHALL be removed from the target entirely and SHALL NOT affect contribution.
- **FR-2.7** The session entry form SHALL show a live **duration** preview formatted as hours (e.g. `10h`, `8h 30m`) using the duration formatter — never the time-of-day formatter. Start/end fields show a time-of-day preview.

### 3.3 Comp Bank
- **FR-3.1** The comp bank SHALL be an explicit, all-time running balance: `sum(compEarned) − sum(compUsed)`.
- **FR-3.2** Comp earned/used SHALL be entered manually per the user; the system SHALL NOT auto-derive comp from overtime.

### 3.4 Leave Accrual
- **FR-4.1** Leave SHALL accrue at **6.15h per pay period**, credited at **period end only** (day 14 / end of week 2).
- **FR-4.2** In week 1 of a period the leave balance SHALL NOT yet change.
- **FR-4.3** `leaveBalAt(idx)` SHALL accrue for completed periods `0..idx-1`, subtract leave used in each, and subtract leave used in the current period up to today; result rounded to 0.1h.
- **FR-4.4** Starting leave balance SHALL be `0h` as of 2025-08-23.

### 3.5 Holidays
- **FR-5.1** Fixed holidays (New Year's, Independence Day/observed, Thanksgiving, Christmas) SHALL always be off and SHALL reduce the period target.
- **FR-5.2** Floating holidays (MLK, Presidents', Memorial, Juneteenth, Labor Day, Columbus, Veterans) SHALL be credit-based: if **taken**, count 8h toward target and consume a floating credit; if **worked**, count as a normal work day with no credit consumed.
- **FR-5.3** Floating credits per year SHALL be: 2025 = 3 (Columbus + Veterans + 1 free); 2026 = 8 (7 federal floating + 1 free).
- **FR-5.4** The free floating credit (1/year) SHALL be assignable to any day via `extraFloating`. Taken floating days SHALL be tracked in `takenFloating`.
- **FR-5.5** The holiday calendar SHALL match the dated tables in `CLAUDE.md` for 2025–2026.

### 3.6 WFH Rules
- **FR-6.1** WFH SHALL be limited to **16h per week**.
- **FR-6.2** The WFH limit SHALL be **waived** for a week with **3 or more office days**.
- **FR-6.3** Location SHALL be tracked per session (`office` / `wfh`).

### 3.7 Navigation
- **FR-7.1** The earliest navigable date SHALL be `2025-08-23`.
- **FR-7.2** Week arrows SHALL step by SAT–FRI weeks; "This Week" SHALL open a **custom dark calendar picker** (not the native browser picker).
- **FR-7.3** The app SHALL expose five tabs: **Week**, **Year & Leave**, **Weight Loss**, **Kara**, **Settings**.
- **FR-7.4** The app SHALL persist the last active tab and sub-view across reloads.

### 3.8 Year & Leave View
- **FR-8.1** A Contract Hours table SHALL list all periods from P1 onward; past periods show work/comp/leave/holiday vs target and leave balance; future periods show projected leave balance (+6.15/period).
- **FR-8.2** A leave-forecast chart SHALL render with x-axis labels at Aug '25, Oct, Jan '26, Apr, Jul, Oct, Dec.
- **FR-8.3** A holiday list SHALL group by year with fixed/floating badges and a taken/worked toggle.

### 3.9 Notes & Tags
- **FR-9.1** Day notes SHALL use a tag system with emoji pills and quick tags (Telework, Travel, Training, Meeting, EoS Report, Event, WFH) plus custom tags.
- **FR-9.2** Tags SHALL be stored as an array; `notes` SHALL be the tags joined by `, ` for backward compatibility.

### 3.10 Birthdays
- **FR-10.1** Birthdays SHALL be stored year-agnostically as `{name, date:"MM-DD"}` and shown on the matching day card every year with a cake icon. Managed in Settings.

### 3.11 Fasting
- **FR-11.1** The Week tab SHALL include a Fasting sub-view computing per-day fasting hours, color-coded by threshold (≥16h, ≥12h).

### 3.12 Weight-Loss Planning
- **FR-12.1** Weekly plans SHALL be code-committed (no in-app editor): `WL_MEAL_OVERRIDES[YYYY-MM-DD]` per day Mon–Fri + Sun (Saturday suppressed/brunch out), and `WL_WEEK_PLANS[mondayDate]` shopping + prep.
- **FR-12.2** Every override day SHALL include `cal`, `protein`, `items[]`, and optional `note`; the renderer SHALL prefer `override.cal`/`override.protein` over `WL_MEALS` defaults.
- **FR-12.3** Shopping/prep items SHALL carry stable `id`s whose checked state lives in `D.weight.weeks[mondayDate]` as `shop_<id>`/`prep_<id>`.
- **FR-12.4** Weigh-in cadence SHALL be **Sunday** (`addDays(mon,6)`); all `WL_TARGETS` dates are Sundays.
- **FR-12.5** Food preferences SHALL be honored: **Ash — no carrots**; **Kara — pico de gallo over salsa**.
- **FR-12.6** On-hand inventory SHALL be a single shared pool (`WL_ONHAND[mondayDate]`); the Coordinate view SHALL sum combined Ash+Kara need, subtract shared on-hand by matching unit, and show only the shortfall.

### 3.13 Persistence & Cloud Sync
- **FR-13.1** State SHALL persist to `localStorage` under `rec_v{N}`; `localStorage` is the source of truth on first sign-in.
- **FR-13.2** When signed in, the app SHALL read/write ONE shared Firestore doc `households/{HOUSEHOLD_ID}/state/main` holding `{ D, updatedAt }`; writes debounced (~1.1s) and queued offline via IndexedDB persistence.
- **FR-13.3** An `onSnapshot` listener SHALL apply remote edits in real time; the app SHALL avoid echoing its own writes via a `pendingRemote` stringified-JSON guard.
- **FR-13.4** A **seed guard** SHALL only auto-seed the shared doc from a device whose local `D` has real data (`hasLocalData()`), so an empty account cannot clobber the shared doc.

### 3.14 Authentication & Calendar
- **FR-14.1** Authentication SHALL use Firebase Auth Google provider via `signInWithPopup`; the same popup SHALL request Calendar scopes so one sign-in covers identity + Calendar.
- **FR-14.2** Each user's UID SHALL be logged to the browser console on sign-in (for populating the rules allowlist).
- **FR-14.3** Calendar events SHALL be pulled per week and sessions SHALL be pushable to the primary calendar via `gapi.client`.
- **FR-14.4** On Calendar 401 (token expiry ~1h), the app SHALL prompt the user to sign in again.

---

## 4. Data Requirements

### 4.1 Settings (`D.settings`)
```json
{
  "payPeriodStart": "2025-08-23",
  "targetHours": 80,
  "leaveAccrualRate": 6.15,
  "startingLeaveBalance": 0,
  "wfhLimit": 16,
  "wfhExemptOfficeDays": 3,
  "takenFloating": ["2026-02-24"],
  "extraFloating": ["2026-02-24"],
  "birthdays": []
}
```

### 4.2 Day model
See **FR-2.1 / FR-2.2**. Days are keyed by `YYYY-MM-DD` under `D.days`.

### 4.3 Versioning
- **DR-1** The `localStorage` key encodes the schema version (`rec_v{N}`). A shape change MUST bump it.

---

## 5. External Interface Requirements

- **EIF-1 Firebase config** SHALL be inline in the top `<script type="module">`; the modular SDK imported from the gstatic CDN.
- **EIF-2 Firestore security rules** (`firestore.rules`) SHALL lock `households/{hid}/**` to `request.auth.uid in [ASH_UID, KARA_UID]`; the two UIDs MUST be filled in and the rules published. A legacy `users/{uid}/**` rule is retained for back-compat.
- **EIF-3 Google Calendar API** SHALL be accessed via `gapi.client` using the popup-issued access token.
- **EIF-4 Google Fonts** (Inter, Playfair Display) is the only styling dependency.

---

## 6. Non-Functional Requirements

### 6.1 Reliability / Correctness
- **NFR-1.1** Date math affecting period/leave/holiday calculations SHALL use UTC day counting (DST-safe). Regression risk: a DST boundary returning 97.9999 instead of 98.
- **NFR-1.2** The seed guard SHALL prevent a fresh/empty account from overwriting shared data.

### 6.2 Availability / Offline
- **NFR-2.1** Core timekeeping SHALL function offline against `localStorage`; cloud writes SHALL queue and reconcile when connectivity returns.

### 6.3 Maintainability
- **NFR-3.1** All logic SHALL remain in the single canonical `Records/index.html`; no duplicated versioned copies.
- **NFR-3.2** `node --check` MUST pass before any change ships.
- **NFR-3.3** Domain rules in `CLAUDE.md` are normative; code changes that alter behavior MUST keep `CLAUDE.md` in sync.

### 6.4 Security / Privacy
- **NFR-4.1** Access to household data SHALL be restricted to the two allowlisted UIDs at the Firestore-rules layer.
- **NFR-4.2** No secrets beyond the public Firebase web config are embedded; that config is not a security boundary — the rules are.

### 6.5 Usability
- **NFR-5.1** The UI SHALL be responsive (desktop + mobile bottom-nav) and preserve the dark warm-amber aesthetic.
- **NFR-5.2** Durations SHALL be displayed in `Xh Ym` form; times of day in 12-hour `h:mm AM/PM` form; the two SHALL never be confused.

---

## 7. Acceptance Criteria (representative)
- A 10-hour session preview renders `10h` (not `10:00 AM`). *(FR-2.7 / NFR-5.2)*
- For any date, `periodOf()` returns the same index regardless of DST. *(FR-1.2 / NFR-1.1)*
- Leave balance increases by exactly 6.15h at each period end and not before. *(FR-4.1/4.2)*
- A taken floating holiday adds 8h to target and decrements available credits; worked does neither. *(FR-5.2)*
- A week with 3 office days ignores the 16h WFH cap. *(FR-6.2)*
- Signing in on an empty account does not overwrite the shared doc. *(FR-13.4)*
- Edits on one signed-in device appear on the other in near real time. *(FR-13.3)*

---

## 8. Open Items / Future Considerations
- Payroll/timesheet export is currently out of scope.
- The app is hard-coded to one household; generalizing to multi-tenant would require parameterizing `HOUSEHOLD_ID` and the rules allowlist.
- Calendar token lifetime (~1h) requires periodic re-auth; a refresh-token flow is not implemented.
