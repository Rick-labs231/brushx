# Getting the APK and sharing it with testers

Not the Play Store yet. This is the free way to let friends and testers install Brush X.
Everything below happens on GitHub; you don't install Android Studio.

> Status: these GitHub workflows were written but **never run** (the place they were written has no internet
> access to GitHub or npm). If a step fails, copy the last 30 lines of the red step and send them to me.

## 1. Put the project on GitHub (once)

1. Go to github.com, sign in as Rick-labs231, press **New repository**. Name it `brushx`. Choose **Public** if you want anyone to
   be able to download it (GitHub Pages and free downloads are simplest on public repos). Don't tick "Add a README".
2. Unzip the Brush X zip. On the new repo page press **uploading an existing file** and drag in the **contents** of the `brushx`
   folder (not the folder itself). Don't upload `node_modules` if you have one. Press **Commit changes**.
   (If you use git: `git init`, `git add .`, `git commit -m "Brush X"`, `git remote add origin <repo url>`, `git push -u origin main`.)
3. Make sure the hidden `.github` folder came across. If drag-and-drop skipped it, use git, or create the two files in
   `.github/workflows/` using **Add file > Create new file** and paste them in.

## 2. Build the APK

1. In the repo open **Actions**. If GitHub asks, press **I understand my workflows, enable them**.
2. Pick **Build Android APK** on the left, press **Run workflow** (green button), then **Run workflow** again.
3. Wait about 10 minutes. A green tick means it worked.
4. Open the run, scroll to **Artifacts**, and download **brushx-apk**. Unzip it: inside is `brushx.apk`.

## 3. Make a download link for testers (recommended)

Pushing a version tag makes GitHub build the APK **and** publish it on a public download page.

1. In the repo press **Releases > Create a new release**.
2. Press **Choose a tag**, type `v0.10.0`, press **Create new tag**, then **Publish release**.
3. Wait for the Actions run to finish (about 10 minutes). The release now shows `brushx.apk`.
4. The permanent link to the newest APK is:
   `https://github.com/Rick-labs231/brushx/releases/latest/download/brushx.apk`
   Send that link (WhatsApp, Telegram, Twitter, your website). Tapping it on a phone downloads the app.
   (The workflow publishes a normal release, so "latest" works. If it ever shows nothing, check the release is not marked "pre-release".)

Each new version: bump the number (v0.10.1, v0.11.0…) and publish a new release.

## 4. How testers install it

1. Open the link on an Android phone and download `brushx.apk`.
2. Open the file. Android says it blocks unknown apps: tap **Settings**, allow your browser or Files app to install apps, go back, tap **Install**.
3. If Play Protect says "unrecognised app", tap **More details > Install anyway**. This is normal for apps outside the Play Store.
4. Updating: **uninstall the old version first.** Debug builds are signed with a new key every build, so Android refuses to
   update over the top (and uninstalling deletes that phone's projects, so tell testers to **Backup all** first).
   This goes away at the Play Store stage, where one permanent signing key is used.

## 5. The website and the web app

1. In the repo: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
2. Open **Actions > Publish website and web app > Run workflow**.
3. After about 3 minutes your site is at `https://rick-labs231.github.io/brushx/` and the web app at
   `https://rick-labs231.github.io/brushx/app/`. (Use a custom domain later in Settings > Pages.)
4. Open `site/index.html` and fill in the `LINKS` block near the bottom: the APK link from step 3, the web app link, your
   Ricknova page and a contact link. Commit, and the site updates itself.

Quick alternatives: drag the `site` folder onto **app.netlify.com/drop** for a link in 30 seconds, or use Cloudflare Pages.

## 6. Keep testers' feedback organised

- Create a WhatsApp or Telegram group "Brush X testers" and pin the download link.
- Ask for: phone model, what they did, a screenshot. In the app, drawing on a very long video can be slow on low-end phones, so ask about that.
- Turn on Issues in the repo (Settings > Features) if you want bug reports in one list.

## Later: the Play Store (next year)

You'll need a signed Android App Bundle (AAB), a Google Play developer account (one-time fee), screenshots, a privacy policy
and the Data safety form. When you're ready I'll add a release-signing step to the workflow.
