# Handoff

Last updated 24 October 2026. Branch `claude/daybreak-mobile-app-7y0uai`. `main` was ce157c4 at last check.

## Mornward app (local-first, iOS via Capacitor)
- Built and running on the owner's iPhone through Xcode (Personal Team). Free-team builds expire after about 7 days:
  re-run from Xcode (do not delete the app first, data survives a reinstall over it).
- Steps 1 and 2 are merged. Strictly local-first: zero network calls, zero trackers, state key `mornward.daybreak.v1`.
- All 10 screens exist (Welcome, Plan, Pact, Hook, Sleep, Wake, Breathe, Act, Down, Rest). Rules are in CLAUDE.md.
- Tests last passing: 4 unit, 69 contrast pairs, 40 Playwright.

### Open items
1. Xcode showed "terminated by the operating system because it is using too much memory (code 9)" on the debug session.
   Not diagnosed. Need to know whether the app itself closes or freezes when opened from the Home Screen.
   First suspects: full-screen blurred sun, infinite animations. Check the Debug navigator memory gauge.
2. Not yet confirmed on device: Rest screen contents, local time versus the 6 PM routing, the Plan, Pact, Hook,
   "Set my morning" walkthrough, the sun slider, the "Terms and privacy" link, the "Open Settings" link (`app-settings:` untested).
3. Act screen: the finished-task strikethrough is far too thick and runs past the text; a wrapped task name has loose
   line spacing. Offered, not changed.
4. Add `ios/App/App/PrivacyInfo.xcprivacy` (no tracking, no collected data, UserDefaults reason CA92.1) by dragging it into Xcode.
5. Clean up the Splash asset warning.
6. Optional: skip today's reminder after an early finish (rolling schedule).
7. Step 3: StoreKit purchases, `chime.wav` (set `CHIME_READY = true`). Needs the paid Apple Developer Program ($99) and App Store Connect.
8. Old anonymous beta records still sit in the Supabase project "Mornward" (us-east-1). `public/terms.html` promises deletion
   within 90 days after the beta ends, or sooner on request. Prepare the SQL and get explicit approval before running it.
9. Owner should read `public/terms.html` once (especially the Thailand and PDPC lines). It is not lawyer-reviewed.
10. Confirm `app.mornward` is the final bundle id before the first App Store Connect upload.

## secure-proxy (separate project, see secure-proxy/README.md)
Reviewed and rewrote the LLM handler, then built auth, routing, rate limiting and the data boundary. 61 tests pass,
type-checks under strict TypeScript on Anthropic SDK 0.137.0 and 1.3.0. Nothing has run against a live identity provider,
the live Anthropic API or AWS.

## How the owner wants to work
The owner wants engineering fundamentals over visual patching: no placeholder code, no "looks right" claims without a test,
root causes instead of patches, and an honest statement of what was and was not verified. Concretely:
- Reproduce a defect first, then fix it, then show the same check passing.
- Every claim of "works" names the test or command that shows it. Say plainly what was not run.
- Security-relevant code gets tests for the hostile cases, not only the happy path.
- Do not change behaviour that a rule in CLAUDE.md protects without saying so.
- Merge, push to `main`, pull requests and any data deletion happen only when the owner asks.
