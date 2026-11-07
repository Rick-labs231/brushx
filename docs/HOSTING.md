# Hosting the Brush X website, step by step

Everything here is free. You need a GitHub account (Rick-labs231) and a phone or computer.
Nothing in this guide has been run against your real GitHub yet, so if a button is named slightly differently, follow the idea.

## Part 1: Put the project on GitHub (once)
1. Go to github.com → **New repository**. Name it exactly `brushx`. Public. Do not tick "add README".
2. On your computer, unzip the Brush X zip, open a terminal inside the folder and run:
   ```
   git init
   git add .
   git commit -m "Brush X v0.10.1"
   git branch -M main
   git remote add origin https://github.com/Rick-labs231/brushx.git
   git push -u origin main
   ```
   (No computer? On github.com open the repo → **Add file → Upload files** and drag the unzipped contents in. The hidden `.github` folder must be included; use a computer if your phone can't upload it.)

## Part 2: Turn on the website
1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Repo → **Actions** tab → **Pages** workflow → **Run workflow**. Wait for the green tick (a few minutes).
3. Your sites are now live at:
   - Brush X website: `https://rick-labs231.github.io/brushx/`
   - The web app itself: `https://rick-labs231.github.io/brushx/app/`
4. If the run fails, open it, click the red step and send me the error text.

## Part 3: Build the Android APK
1. Repo → **Actions → Android APK → Run workflow**. It takes about 5–10 minutes.
2. When finished, open the run. At the bottom, under **Artifacts**, is `brushx-debug-apk`. Download it: it is a zip containing `brushx-debug.apk`. This is how you get the APK yourself.

## Part 4: Make a permanent download link (what the website button uses)
1. Repo → **Releases → Draft a new release → Choose a tag**, type `v0.10.1`, **Create new tag**, then **Publish release**.
   (Or on a computer: `git tag v0.10.1 && git push origin v0.10.1`.) Pushing a `v*` tag runs the APK workflow and attaches `brushx-debug.apk` to the release automatically.
2. Wait for the workflow to finish, then open the Releases page. `brushx-debug.apk` should be listed under Assets.
3. The link that always points to the newest APK is:
   `https://github.com/Rick-labs231/brushx/releases/latest/download/brushx-debug.apk`
   (The workflow publishes it as a normal release so "latest" works.)
4. For each new version later: bump the version, push a new tag (`v0.10.2`). The same link then gives the new APK.

## Part 5: How the download button works on the site
The site has one block near the bottom of `site/index.html`:
```js
const LINKS = { download: "", web: "", ricknova: "", telegramBot: "", whatsapp: "", github: "...", contact: "" }
```
Every button marked `data-link="download"` takes its address from `LINKS.download`. While it is empty, the button shows "coming soon". Once filled in, tapping **Download for Android** downloads the APK straight from your GitHub release. Nothing else to change.

## Links to give me (I will fill them in for you)
| What | Example | Needed for |
|---|---|---|
| APK link | `https://github.com/Rick-labs231/brushx/releases/latest/download/brushx-debug.apk` (assumes the repo is `brushx`) | Download button |
| Web app link | `https://rick-labs231.github.io/brushx/app/` | "Open in browser" |
| Ricknova website link | e.g. `https://rick-labs231.github.io/` | Brush X site → Ricknova |
| Brush X website link | `https://rick-labs231.github.io/brushx/` | Ricknova site → Brush X |
| Telegram bot link | `https://t.me/<bot_username>` | Both sites |
| WhatsApp channel link | `https://whatsapp.com/channel/...` | Both sites |
| Contact | email, or Telegram/WhatsApp link | Footer |

## Sending the APK to your WhatsApp channel
Best method: **post the link, not the file.**
1. Open your WhatsApp channel → write a post with a short message plus the link, e.g. your Brush X website link (it has the Download button, the guide and the install steps) or the direct APK link.
2. Use this wording: "Brush X test build is out. Download, tap the file, allow install from this source if asked. If you have an older build, uninstall it first."
Sending the file itself: download `brushx-debug.apk` from the release (phone: Releases → Assets → tap it). WhatsApp often blocks or renames `.apk` files, so if it refuses, put the APK in a zip or just share the link.

## What testers will see
- Android asks to allow installs from the browser/WhatsApp: allow it for that one install.
- Google Play Protect may warn about an unknown app: tap **More details → Install anyway**. This happens because it is a test build, not on the Play Store yet.
- **Update caveat:** every CI build is signed with a new debug key, so testers must **uninstall the old version before installing a new one** (their saved projects are lost unless they exported them first). Tell them to export before updating. Permanent fix when you move to Play Store: create one release keystore.

## Alternatives
- **Netlify Drop:** go to app.netlify.com/drop, drag in the built `site` folder (and the `dist` web app if you want it). Works with no GitHub, but you must redo it on each update.
- **Custom domain:** buy one, then Settings → Pages → Custom domain. Tell me and I will update links.

## Connecting Supabase (cloud sync) to the builds
The build reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Do NOT commit them in a file.
- **GitHub (website, web app and APK):** repo → Settings → Secrets and variables → Actions → **Variables** tab → New repository variable. Add both names above. (The anon key is public by design, so a variable is fine. Never add the `service_role` key anywhere.) Then re-run the workflows.
- **Your laptop (local `npm run dev`):** copy `.env.example` to `.env` and fill in both values. `.env` is git-ignored.
- Supabase dashboard → Project Settings → API gives the Project URL and the `anon public` key.
- If you skip this, the app still works: users can type the URL and key into Profile → Cloud sync instead.
