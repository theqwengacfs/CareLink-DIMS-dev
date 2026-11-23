# assetlinks.json — hides the browser address bar in the Android app

This folder is served by Vercel at `https://care-link-dims-dev-three.vercel.app/.well-known/assetlinks.json`.

Android reads this file to decide whether the CareLink app may open the website
**full-screen without a browser address bar** (a Trusted Web Activity). Until the
real certificate fingerprint is filled in, the app still works — it just shows a
browser address bar at the top.

## How to fill in the real fingerprint (after your first APK build)

1. Run the **Build Android APK** workflow (GitHub → Actions) and download the
   `CareLink-signing-key-KEEP-SAFE` artifact.
2. On any computer with Java, run:

   ```bash
   keytool -list -v -keystore android.keystore -alias carelink -storepass carelink123
   ```

   Look for the line starting with `SHA256:` — copy the fingerprint exactly
   (uppercase, colon-separated).
3. Replace the `00:00:...` placeholder in `assetlinks.json` with that fingerprint.
4. Commit and push. Vercel redeploys automatically.
5. Rebuild the APK (Actions → Build Android APK → Run workflow) and reinstall.

> If you publish to the Google Play Store with **Play App Signing** enabled,
> Google gives you a *different* SHA-256 fingerprint (shown in Play Console →
> App integrity). Add that second fingerprint to the list as well — the app
> accepts either one.
