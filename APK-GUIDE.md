# CareLink Android App — Get Your APK in 7 Easy Steps

**You do not need to install anything on your computer.** GitHub builds the app
for you. You only click buttons and download a file.

Your CareLink website is already prepared for this (the app name, icon, and
"installable" settings were already in place). The only thing missing was the
APK file itself — and that is what the automatic builder below creates.

---

## What you will get

- **CareLink-APK** — a file ending in `.apk`. This is the app you install on an
  Android phone to test it.
- **CareLink-AAB** — a file ending in `.aab`. This is for later, if you publish
  to the Google Play Store. You do not need it for testing.
- **CareLink-signing-key-KEEP-SAFE** — a special key file. **Keep it safe.**
  Think of it like the only key to your office. Every future update to the app
  must use this same key. If you lose it, phones cannot update the app — they
  would have to uninstall and reinstall. Save a copy somewhere safe (a USB
  stick, Google Drive, or a password manager). Do not share it publicly.

The app opens your **live website** inside a proper app window (no browser
address bar, once the final step in this guide is done). That means: when you
update the website, the app shows the update automatically. You do **not** need
to rebuild the APK every time the website changes.

---

## Step-by-step: build your first APK

1. Open your project on GitHub:
   **https://github.com/theqwengacfs/CareLink-DIMS-dev**

2. Click the **Actions** tab at the top of the page.

3. In the list on the left, click **Build Android APK**.

4. Click the green **Run workflow** button (top right), then click the green
   **Run workflow** button again to confirm.

5. Wait about **10 minutes**. You will see a yellow circle while it works, then
   a green tick when it is finished. (If you see a red cross, open the run and
   read the error — or ask for help with the error message.)

6. Click the finished run. Scroll down to **Artifacts** at the bottom. You will
   see three downloads:
   - **CareLink-APK** ← download this one
   - **CareLink-AAB** (for the Play Store later)
   - **CareLink-signing-key-KEEP-SAFE** ← save this somewhere safe!

7. The APK download is a `.zip` file. Open it and take out the `.apk` file
   inside. Send that `.apk` to your Android phone (WhatsApp, Bluetooth, USB
   cable, or email — any way you like).

---

## Install the app on your phone

1. On the phone, tap the `.apk` file.
2. If asked, allow **"Install unknown apps"** for the app you are installing
   from (this is normal for test apps — it is not a virus warning).
3. Tap **Install**. The CareLink icon appears on your home screen.
4. Tap the icon. CareLink opens full-screen, like a normal app.

**Note:** the first time you open it, the app may show a browser address bar at
the top. That is expected for the first test build. The final step below
removes it.

---

## Final step (optional): remove the address bar

After your first build, do this once so the app opens truly full-screen:

1. Download the **CareLink-signing-key-KEEP-SAFE** artifact from the same run.
2. Ask someone with a computer to run this command (it prints a code):

   ```
   keytool -list -v -keystore android.keystore -alias carelink -storepass carelink123
   ```

   Find the line starting with `SHA256:` and copy the code after it.
3. Open the file `public/.well-known/assetlinks.json` in this project, replace
   the `00:00:...` code with the copied code, and save.
4. Commit and push (Vercel updates the website automatically).
5. Build the APK again (Actions → Build Android APK → Run workflow) and
   reinstall it on the phone.

From then on, the app opens with **no address bar** — just CareLink.

---

## Good to know

- **Website updates appear automatically.** The app loads the live website, so
  you do not need a new APK when the website changes.
- **Rebuilding gives a new key.** Each build creates a fresh signing key. If you
  build again later, uninstall the old app from the phone first, then install
  the new one. (This only matters for testing — see the key warning above.)
- **Internet needed.** Like the website, the app needs an internet connection
  to load live data. CareLink already has offline support for the app shell.
- **Google Play Store (later).** Publishing to the Play Store costs a one-time
  $25 fee for a developer account. Upload the `.aab` file there. The website
  and the app itself remain free.

## Alternative: build it in your browser (no GitHub Actions)

If you prefer, you can also use **PWABuilder** (free, from Google):

1. Open **https://www.pwabuilder.com**
2. Paste this address and press Start:
   `https://care-link-dims-dev-three.vercel.app/carelink-v6.html`
3. Click **Package for Stores** → **Android** → **Generate Package**.
4. Download the `.zip` — it contains the `.apk`, the `.aab`, and the signing
   key. Keep the key safe, same as above.

The GitHub Actions builder in this project does the same thing automatically,
and keeps the build steps in one place.
