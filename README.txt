FOUNDERS FOOTBALL CUP 26/27 - SHARED DATABASE (SUPABASE) VERSION

Files: index.html, style.css, app.js, data.js, config.js, setup.sql

HOW IT WORKS
- Everyone who opens the site reads the tournament data from Supabase.
- Only a signed-in admin account can change it (enforced by the database, not by JavaScript).
- data.js is now just the STARTING data. The first time the admin saves anything,
  the current data is copied into the database. After that, the database wins.
- If config.js is left empty, the site still works in "this browser only" mode
  with the old password (GFCadmin26 in app.js).

ONE-TIME SETUP
1. Create a free project at supabase.com.
2. SQL Editor -> New query -> paste everything from setup.sql -> Run.
3. Authentication -> Users -> Add user -> Create new user.
   Enter your admin email + a strong password (tick "Auto Confirm User").
4. Authentication -> Sign In / Providers (or Settings) -> turn OFF "Allow new users to sign up".
   IMPORTANT: otherwise anyone could register and become an admin.
5. Project Settings -> API -> copy the Project URL and the anon public key into config.js.
6. Upload all the files to your host. Open the site -> Home -> Edit -> sign in with the email/password from step 3.

NOTES
- The anon key in config.js is meant to be public. Never put the "service_role" key anywhere in the site.
- "Reset everything to data.js" in the admin page overwrites the shared database with data.js.


LIVE MATCHES (added)
- Admin page -> "Live match control": pick a match, press Start match, then add goals,
  penalties (awarded / scored / saved / missed), own goals, yellow and red cards with the minute.
- Goals and scored penalties update the score and the top-scorers table automatically.
  Deleting an event undoes it.
- The match minute keeps counting on every visitor's screen. Use Half time / Start 2nd half /
  Full time, or "Set minute" if the clock drifts. Only finished matches count in the standings.
- Visitors see changes within seconds without refreshing. For instant pushes, run the last block
  of setup.sql once (it is safe to re-run the whole file).
