# Signing the Android app (one-time setup)

Why: until now every build got a different random "debug" signature, so Android refused to install a new
version over an old one and testers had to uninstall first (losing their projects). With **one permanent
key**, every new version installs over the old one and keeps the user's projects. The Play Store also needs
this later, so use the same key from the start.

## 1. Make the key (once, on your laptop)
1. Install Java if `keytool` isn't found: `winget install EclipseAdoptium.Temurin.21.JDK`, then close and reopen VS Code.
2. Pick a safe folder that is NOT inside the project, for example `C:\keys`:
   ```
   mkdir C:\keys
   cd C:\keys
   keytool -genkeypair -v -keystore brushx-release.jks -alias brushx -keyalg RSA -keysize 2048 -validity 10000
   ```
3. It asks for a password (use a long one and use the same one if it asks twice) and some name questions
   (Rick, Ricknova, Lagos, NG; any answers work). Confirm with `yes`.
4. **Back up `brushx-release.jks` and the password now** (password manager, a USB stick, a private cloud
   folder). If you lose either, you can never update the app under the same identity.

## 2. Give it to GitHub as secrets
1. Turn the key file into text and copy it:
   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\keys\brushx-release.jks")) | Set-Clipboard
   ```
2. On GitHub: repo `brushx` → Settings → Secrets and variables → Actions → **Secrets** tab → New repository secret. Add four:

   | Name | Value |
   |---|---|
   | `KEYSTORE_BASE64` | paste what you just copied |
   | `KEYSTORE_PASSWORD` | the password |
   | `KEY_ALIAS` | `brushx` |
   | `KEY_PASSWORD` | the same password |

These are real secrets (unlike the Supabase variables). Never paste them in the repo, in chat, or in a screenshot.

## 3. Build
Push a new tag (for example `v0.10.3`). The **Build Android APK** run now builds a signed release and
attaches `brushx.apk` to the release. In the run's log, the "Sign the APK" step should end with
`Verifies`. If the secrets are missing it falls back to a debug build and prints a warning.

## 4. What testers will notice
- **Once:** the first signed build has a different signature from the debug builds, so everyone must
  uninstall the old Brush X one last time (export or sync projects first).
- **After that:** every new version installs straight over the old one and keeps their projects.
- Each build gets a rising version number automatically, which Android needs to accept updates.
- The app checks GitHub for a newer release when it opens (at most every 6 hours) and shows a
  "Brush X x.y.z is available" card with a Download button. Profile → Version has "Check for updates".
