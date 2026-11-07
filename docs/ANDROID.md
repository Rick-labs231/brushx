# Brush X on Android (test APK)

Brush X is a web app wrapped as an Android app with Capacitor. The simplest way to get an APK without installing
Android Studio is to let GitHub build it for you.

> Status: this pipeline was written but **has not been run** (the sandbox it was written in can't reach npm,
> GitHub or the Android SDK). Expect to fix one or two small things the first time it runs. The web app itself
> is tested, including a phone-sized touch test.

## Option A: GitHub builds the APK (no installs)

1. Put the project in a GitHub repo (for example `Rick-labs231/brushx`) and push it.
2. Open the repo on GitHub, go to **Actions**, pick **Build Android test APK**, press **Run workflow**.
3. Wait about 10 minutes. When it finishes, open the run and download **brushx-debug-apk** from *Artifacts* (a zip with `app-debug.apk`).
4. Send `app-debug.apk` to your phone (WhatsApp, Drive, USB). Open it and allow *Install unknown apps* when Android asks.
5. Testers install the same file. A debug APK is fine for testing, but it can't be uploaded to the Play Store.

If a step fails, open the failed step in the run log and send me the last 30 lines.

## Option B: on your own computer

Needs Node 22, JDK 21 and Android Studio (for the SDK).

```
npm install
npm run android:apk          # build web, sync, assemble debug APK
npm run android:open         # or open the android/ folder in Android Studio and press Run
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

## What works differently in the app

- **Saving files**: exports (PNG, GIF, video, `.brushx`, backups) open the Android share sheet so you can save to Files, Drive or send on WhatsApp.
- **Projects** are stored inside the app (IndexedDB). Uninstalling the app deletes them, so use *Backup all* or cloud sync.
- **Video export** needs WebCodecs in the phone's WebView (Android 10+ with a current Android System WebView). If it isn't available, Export shows PNG sequence/GIF only.
- **Cloud sync**: enter your Supabase URL and anon key on the Profile screen as on the web.

## Before the Play Store

- Create a release **signed AAB** (Android Studio: Build > Generate Signed Bundle, or add a keystore to the workflow as GitHub secrets).
- Pay the one-time Play Console fee, add screenshots, a privacy policy URL and the Data safety form (cloud sync stores email + projects).
- Change `appId` in `capacitor.config.ts` only before the first upload. It can never change afterwards.
- Test on at least one low-end phone: big canvases and long imported videos use a lot of memory.
