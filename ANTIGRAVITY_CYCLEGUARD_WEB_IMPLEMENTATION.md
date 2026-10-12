# Antigravity Implementation Brief — CycleGuard Web App
## Add Event History, Daily Activity Journal, Timetable-Aware Security Coach, and a Safe Learning Foundation

You are working inside the existing repository:
`https://github.com/Manoj1832/CycleGuard.git`

**Scope for this first iteration: update the existing WEB APPLICATION only.**
Do not redesign or modify the Flutter app in this task. Keep the current ESP32-C3 firmware, EMQX MQTT topics, device command protocol, and production web app behavior compatible.

## 1. Required workflow — do this before editing
1. Inspect the repository structure and read the existing README, project summary, backend server/routes/state/MQTT implementation, frontend HTML/CSS/JS, and current data/config handling.
2. Identify the current web app entry point and existing styling conventions. Reuse them instead of replacing the app with a new framework.
3. Write a concise implementation plan and list the exact files you intend to add/change.
4. Then implement the feature in small, coherent changes. Do not stop after only giving a plan.
5. Run the available lint/build/tests or at minimum syntax checks. Report exactly what was and was not tested.
6. Do not claim deployment or production verification unless you actually performed it.

## 2. Preserve current functionality — non-negotiable
- Keep existing authentication/passkey/PIN-related flows and access checks intact. Do not bypass or weaken authentication.
- Preserve existing MQTT command contract: `ARM` and `DISARM`, existing device ID conventions, topic names, TLS behavior, and current device interaction.
- Preserve current dashboard, current status display, alarm notifications, push notifications, and Last Activity functionality.
- Do not change firmware or require new hardware.
- Keep existing frontend and API routes backward compatible. If an API must change, add a backward-compatible endpoint/response instead of silently breaking existing consumers.
- Do not expose MQTT credentials, Firebase service credentials, secrets, or private environment values in frontend code or logs.
- Do not weaken TLS certificate verification or CORS/security headers.
- No unrelated full rewrite, no migration to a different frontend framework, and no destructive file replacement.

## 3. Feature goals
Add four connected web-app capabilities:

### A. Persistent Event History
Create an authoritative append-only history of meaningful events. Start with the repository's existing persistence conventions; if the current JSON state file is the only persistence mechanism, do not confuse current state with history. Prefer a separate event store. For this small prototype, JSON Lines (JSONL) can be used if appropriate and robustly implemented; explain limitations and keep the storage layer replaceable by a database later. Do not add a database dependency unless it is justified by the existing architecture and documented.

Each event should have fields equivalent to:
- `eventId`: unique ID generated on the server
- `deviceId`: device identifier
- `userId`: authenticated owner ID when available; never guess ownership
- `type`: stable machine-readable event type
- `occurredAt`: authoritative server-generated ISO-8601 UTC timestamp
- `source`: `real`, `mock`, or `user_confirmed`
- `origin`: `mqtt`, `web`, `system`, `schedule`, or `demo`
- `message`: concise human-readable summary
- `details`: optional safe metadata object
- `schemaVersion`: integer, start at 1

Use clear event types, for example:
`DEVICE_CONNECTED`, `DEVICE_DISCONNECTED`, `DEVICE_ARMED`, `DEVICE_DISARMED`,
`ARM_REQUESTED`, `DISARM_REQUESTED`, `MOVEMENT_DETECTED`, `ALARM_ACTIVATED`,
`ALARM_CLEARED` (only if genuinely supported), `PARKING_CONFIRMED`,
`MOCK_ROUTINE_EVENT`.

Do not invent an alarm-cleared event if the existing system does not actually report or confirm it. Keep **movement detected**, **alarm activated**, **arm/disarm requested**, and **arm/disarm confirmed** as distinct concepts. Only record a confirmed event when the existing system supplies credible confirmation.

### B. Daily Activity Journal
Add a polished, responsive web UI section or page called **Activity Journal**:
- Today summary: confirmed arm/disarm events, movement/alarm events, and the latest event.
- Chronological event list, newest first, with readable timestamp, event label, source label, and severity/icon.
- Date filter and event-type/source filters if practical.
- Clear visual distinction between `REAL`, `MOCK`, and `USER CONFIRMED` data.
- Empty/loading/error states.
- Use accessible semantic HTML and existing project styling.
- Never present mock events as actual security incidents. Never merge mock data into real event history without retaining its source label.

### C. Timetable-Aware Security Coach
Use the supplied `mock-data/timetable_schedule.csv` and `mock-data/mock_user_routine.csv` as **development/demo fixtures only**. Adapt the path to the repository's conventions; do not hard-code absolute local paths.

Build a simple explainable rule-based coach first. Example outputs:
- “Your schedule suggests you may be on campus today. If your bicycle is parked, confirm that it is secured.”
- “Your usual return time is approaching. Check the bicycle's security state if it is parked.”
- “Your device is currently disarmed. If the bicycle is parked in a public area, consider arming it.”

Rules:
- Treat timetable/routine as a hint, not proof that the user attended class, rode a bicycle, or parked it.
- Phrase recommendations as optional prompts, not factual claims.
- Never arm/disarm the device automatically.
- Never silence, delay, or suppress an alarm based on a schedule or prediction.
- Do not send notifications automatically in this first iteration unless there is already a safe, user-controlled notification preference system. In-app recommendations are sufficient.
- Explain each recommendation with a short reason and display the data source/assumption.
- Do not make a recommendation when required data is missing; show a helpful empty state instead.

### D. Learning-ready architecture (not autonomous training yet)
Prepare clean interfaces for later personalization, but do not train or deploy an ML model in this task.
- Record explicit, user-confirmed events such as “I parked my bicycle” only when the user performs that action.
- Keep predictions/recommendations separate from ground-truth event records.
- Never treat a recommendation, a schedule entry, a mock event, or a model prediction as a verified label.
- Do not create a self-training loop from the system's own predictions.
- Add a small, documented service/interface boundary so a future routine-learning component can consume only eligible, consented, correctly labeled real/user-confirmed events.
- If no consent/settings mechanism currently exists, do not invent a broad data collection policy; add a clear TODO and keep learning disabled by default.

## 4. Mock-data handling
The files supplied alongside this prompt are sample fixtures:
- `mock-data/timetable_schedule.csv`
- `mock-data/mock_event_history.csv`
- `mock-data/mock_user_routine.csv`

Use them for demo/testing only. Validate CSV input and dates/times. Do not import mock rows into the real persistent event log. Keep `source: "mock"` on every mock record and visually mark demo mode. Do not include personal identifiers beyond a local demo ID. If the app is in production, mock mode must be disabled by default and never accidentally activated by a query parameter or untrusted client request.

Prefer a backend-controlled environment setting such as `CYCLEGUARD_DEMO_MODE=false` by default. Validate and document any new environment variable. If a safe backend demo switch cannot be implemented without undermining current deployment, keep fixtures for local development only and explain how to enable them safely.

## 5. API and backend requirements
Follow existing Express/API conventions. Inspect current routes before adding endpoints. Suggested endpoint shapes (adapt to existing conventions):
- `GET /api/device/:deviceId/events?from=...&to=...&type=...&source=...&limit=...`
- `GET /api/device/:deviceId/journal/summary?date=YYYY-MM-DD`
- `GET /api/device/:deviceId/security-coach`

These are proposals, not permission to break existing routes. Validate all path/query inputs, cap page size, use UTC consistently, return predictable JSON errors, and enforce existing authentication/ownership rules. If the current project does not yet establish user-to-device ownership for an endpoint, do not pretend it does: document the gap and follow the project's current security boundary without exposing other devices' events.

Add server-side tests for event validation, source separation, filtering, duplicate handling, timestamp generation, and coach rules where the current test setup permits. If no test framework exists, add focused tests only if lightweight and compatible; otherwise run syntax checks and document manual test steps.

## 6. Event integrity and deduplication
- Current-state snapshots sent over WebSocket are not new events by themselves.
- Do not create a new event just because the page reconnects or receives an initial state snapshot.
- Avoid duplicate event entries when a command is requested and later confirmed by MQTT. These should be different event types only if both are useful, and their relationship must be clear.
- Use event IDs and/or a stable deduplication key for repeated MQTT deliveries where feasible.
- Do not silently rewrite old events when the current device state changes.
- Use the backend/server timestamp as the canonical event time. If device uptime (`millis()`) is available, store it separately as metadata; do not treat uptime as a calendar timestamp.

## 7. Frontend UX
- Integrate into the existing web dashboard and navigation; do not replace the current layout wholesale.
- Make it responsive on mobile and desktop.
- Provide clear labels/chips: `REAL`, `MOCK`, `USER CONFIRMED`.
- Separate security events from coach recommendations. A recommendation is not an event.
- Use the existing icon/chart libraries if already present; do not add heavy dependencies for simple lists.
- Ensure dates are rendered in the user's local timezone while stored as UTC ISO-8601.
- Show when the page is displaying demo data.
- Keep loading, error, no-results, and no-data states polished.
- Do not display fabricated statistics as live metrics.

## 8. Acceptance criteria
The implementation is complete only when:
1. Existing dashboard and ARM/DISARM controls still work unchanged.
2. Existing authentication/security behavior has not been bypassed.
3. A meaningful backend event can be persisted and retrieved after server restart, subject to the chosen storage approach.
4. Mock history is clearly marked and never mixed invisibly with real events.
5. Journal filters and date display work correctly.
6. Coach advice is rule-based, explainable, optional, and cannot control hardware.
7. State snapshots/reconnects do not create fake activity events.
8. There is no ML training or automatic security action.
9. New routes and storage have input validation and safe error handling.
10. The final response lists changed files, API routes, environment variables, tests executed, known limitations, and manual verification steps.

## 9. Suggested implementation sequence
1. Audit existing code and describe the plan.
2. Implement event schema and persistence service.
3. Integrate only genuine state transitions/events from current backend/MQTT handling.
4. Add read-only API endpoints and validation.
5. Add demo fixtures behind a backend-controlled development-only switch.
6. Add Activity Journal UI and source filters.
7. Add timetable-aware Security Coach UI and explainable rules.
8. Add tests/syntax checks and document setup.

## 10. Final report format
At completion, report:
- Summary of implemented behavior
- Files added/modified
- API endpoints and sample responses
- New environment variables and safe defaults
- Commands/tests run and their actual results
- Manual test checklist
- Security/data-integrity limitations still open
- Explicit statement that Flutter and firmware were not modified
