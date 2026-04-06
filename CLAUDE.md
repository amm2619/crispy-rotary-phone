# Records — Timekeeping App

## What This Is
A single-file HTML timekeeping app for a federal contractor (Nightwing). Tracks work sessions, comp time, leave, and holidays against a biweekly pay period target. Dark warm-amber aesthetic (Inter + Playfair Display). No external dependencies except Google Fonts.

## Current File
- App: `records_v25.html`
- localStorage key: `rec_v35`
- Every new version: increment both the filename AND the localStorage key

## Versioning Rules
- ALWAYS increment the version number when making changes
- Filename: `records_v{N}.html` → `records_v{N+1}.html`
- localStorage key: `rec_v{N}` → `rec_v{N+1}` (forces fresh load, clears stale cache)
- ALWAYS run `node --check` on extracted JS before shipping
- NEVER ship without a syntax check passing

---

## Pay Period Rules

- **Schedule:** SAT–FRI, 14 days
- **Start date:** `2025-08-23` (Saturday — first pay period)
- **Period target:** starts at **-80h**, closes to 0 as hours are logged
- **Week target:** each week starts at **-40h**
- **Period index:** `Math.floor((date - payPeriodStart) / 14 days)` using UTC math (not ms subtraction — DST causes off-by-one errors)
- **Total periods:** 35 (Aug 23 2025 through end of 2026)

### DST Fix (Critical)
Always use UTC day counting in `periodOf()`:
```js
function toUTCDays(s){const p=s.split('-');return Date.UTC(+p[0],+p[1]-1,+p[2])/86400000;}
const days=Math.round(toUTCDays(d)-toUTCDays(D.settings.payPeriodStart));
```
Never use `(new Date(a) - new Date(b)) / 86400000` — DST causes this to return 97.9999 instead of 98.

---

## Leave Accrual Rules

- **Rate:** 6.15h per pay period
- **Timing:** accrues at **period END only** (end of week 2 / day 14)
- **Week 1 of a period:** leave balance does NOT change yet
- **Week 2 / period complete:** +6.15h shows up
- **Starting balance:** `-70.55h` (before first Aug 23 2025 accrual)
- This is calibrated so that after 9 periods (reaching Dec 27 2025), balance = -15.2h, matching the spreadsheet

### leaveBalAt(idx)
Accrues for completed periods `0..idx-1` only. Also deducts any leave used so far in the current period (idx):
```js
function leaveBalAt(idx){
  let b = D.settings.startingLeaveBalance;
  for(let i=0;i<idx;i++){
    b += D.settings.leaveAccrualRate;
    // subtract leave used in period i
  }
  // subtract leave used in current period up to today
  return Math.round(b*10)/10;
}
```

---

## Day Data Model

```json
{
  "sessions": [{"id":"s123","start":8.0,"end":17.5,"loc":"office","note":""}],
  "compEarned": 0,
  "compUsed": 0,
  "leave": 0,
  "holiday": 0,
  "notes": "",
  "tags": ["telework","meeting"]
}
```

### What Counts Toward the 80h Target
`dayContribution = workHours + compUsed + leave + holiday`

`compEarned` does NOT count toward 80h — it banks hours into the comp bank.

### Comp Bank
- Running all-time balance: `Σ compEarned - Σ compUsed`
- **Explicit only** — never auto-calculated from overtime
- User marks comp earned/used manually per session

---

## Holiday Model

### Fixed Holidays (always off, always reduce period target)
- New Year's Day
- Independence Day (Jul 4 / observed)
- Thanksgiving
- Christmas Day

### Floating Holidays (credit-based — user chooses to work or take)
- MLK Day, Presidents' Day, Memorial Day, Juneteenth, Labor Day, Columbus Day, Veterans Day
- If **taken**: counts as 8h toward 80h target, uses a floating credit
- If **worked**: counts as a regular work day, no credit used

### Floating Credits Per Year
- 2025: Columbus Day + Veterans Day + 1 free = 3 total credits
- 2026: 7 federal floating + 1 free = 8 total credits
- Note: No Labor Day 2025 — Ash started Sep 2, 2025 (after Labor Day Sep 1)

### Free Floating Holiday
- 1 per year, can be assigned to ANY day
- 2026: Feb 24 is the taken free floating day

### Settings Fields
- `takenFloating`: array of date strings where floating holiday was taken
- `extraFloating`: array of date strings used for the free floating slot

---

## WFH Rules
- Limit: **16h per week**
- Waived if: **3+ office days** that week
- Location tracked per session: `loc: 'office'` or `loc: 'wfh'`

---

## Navigation
- Earliest date: `2025-08-23` (first pay period start)
- "This Week" button opens a **custom dark calendar picker** (not native browser picker)
- Arrows step week by week (SAT–FRI)
- `thisSaturday()` finds the most recent Saturday using JS `getDay()`

---

## Settings Stored in D.settings
```json
{
  "payPeriodStart": "2025-08-23",
  "targetHours": 80,
  "leaveAccrualRate": 6.15,
  "startingLeaveBalance": -70.55,
  "wfhLimit": 16,
  "wfhExemptOfficeDays": 3,
  "takenFloating": ["2026-02-24"],
  "extraFloating": ["2026-02-24"],
  "birthdays": []
}
```

---

## Birthdays
- Stored as `[{name: "Casper", date: "10-19"}]` (MM-DD format, year-agnostic)
- Show on day cards every year with 🎂 icon
- Managed in Settings tab

---

## Note Tags System
Day notes use a tag-based system with emoji pills:
- Quick tags: 🏠 Telework, ✈️ Travel, 📚 Training, 📋 Meeting, 📊 EoS Report, 🎉 Event, 💻 WFH
- Custom tags typed into input + Enter
- Stored as `tags: ["telework", "meeting"]` array on the day
- `notes` field = tags joined by `, ` for backward compatibility

---

## Year & Leave Tab
- Contract Hours table: shows all periods from P1 (Aug 23) onward
- Past periods: work + comp + leave + holiday breakdown, vs target, leave balance
- Future periods: projected leave balance (accruing +6.15 per period)
- Leave forecast chart: x-axis labels at Aug '25, Oct, Jan '26, Apr, Jul, Oct, Dec
- Holiday list: grouped by year, fixed vs floating badges, taken/worked toggle

---

## Holidays by Date
### 2025
| Date | Holiday | Type |
|------|---------|------|
| Oct 13 | Columbus Day | Floating |
| Nov 11 | Veterans Day | Floating |
| Nov 27 | Thanksgiving | Fixed |
| Dec 25 | Christmas Day | Fixed |

### 2026
| Date | Holiday | Type |
|------|---------|------|
| Jan 1 | New Year's Day | Fixed |
| Jan 19 | MLK Day | Floating |
| Feb 16 | Presidents' Day | Floating |
| May 25 | Memorial Day | Floating |
| Jun 19 | Juneteenth | Floating |
| Jul 3 | Independence Day (observed) | Fixed |
| Sep 7 | Labor Day | Floating |
| Oct 12 | Columbus Day | Floating |
| Nov 11 | Veterans Day | Floating |
| Nov 26 | Thanksgiving | Fixed |
| Dec 25 | Christmas Day | Fixed |

---

## Google Calendar Sync (Planned)
The app is intended to sync with Google Calendar via a local Node.js server:
- OAuth handled locally (no cloud backend)
- Events/birthdays pulled from Google Calendar
- Server runs on localhost, serves the HTML with a sync API endpoint
- Token stored locally, auto-refreshed
