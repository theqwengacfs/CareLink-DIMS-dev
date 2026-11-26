/**
 * CareLink Android (TWA) project generator — non-interactive.
 *
 * Generates a Trusted Web Activity Android project from the live CareLink PWA
 * manifest using Google's Bubblewrap core library. This is the same engine
 * PWABuilder uses under the hood, but scripted so it can run unattended in
 * GitHub Actions (the `bubblewrap init` CLI prompts interactively and cannot
 * be used in CI).
 *
 * Usage (from the repository root):
 *   npm install --no-save @bubblewrap/core
 *   node tools/build-android.mjs
 *
 * Environment overrides:
 *   CARELINK_APP_VERSION_NAME  (default: 6.9.8)
 *   CARELINK_APP_VERSION_CODE  (default: 696)
 *   CARELINK_MANIFEST_URL      (default: live Vercel manifest)
 *   CARELINK_ANDROID_DIR       (default: ./android)
 *
 * The signing keystore is generated with keytool (on PATH via setup-java)
 * using the fixed test passwords below. The keystore + passwords are uploaded
 * as a workflow artifact — KEEP THEM SAFE: every future update to the Android
 * app must be signed with the same key.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BufferedLog, ConsoleLog, TwaGenerator, TwaManifest } from '@bubblewrap/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const MANIFEST_URL =
  process.env.CARELINK_MANIFEST_URL ||
  'https://care-link-dims-dev-three.vercel.app/manifest.webmanifest';
const ANDROID_DIR = path.resolve(
  REPO_ROOT,
  process.env.CARELINK_ANDROID_DIR || 'android',
);
const APP_VERSION_NAME = process.env.CARELINK_APP_VERSION_NAME || '6.9.8';
const APP_VERSION_CODE = Number(process.env.CARELINK_APP_VERSION_CODE || 696);
const PACKAGE_ID = 'com.lomamo.carelink';
const KEYSTORE_FILE = 'android.keystore';
const KEY_ALIAS = 'carelink';
const KEYSTORE_PASSWORD = 'carelink123';
const KEY_PASSWORD = 'carelink123';

function log(message) {
  console.log(`[build-android] ${message}`);
}

function computeChecksum(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

async function main() {
  log(`Manifest URL : ${MANIFEST_URL}`);
  log(`Android dir  : ${ANDROID_DIR}`);
  log(`Version      : ${APP_VERSION_NAME} (${APP_VERSION_CODE})`);

  fs.mkdirSync(ANDROID_DIR, { recursive: true });

  // 1. Fetch the live web manifest and turn it into a TWA manifest.
  log('Fetching web manifest…');
  let twaManifest = await TwaManifest.fromWebManifest(MANIFEST_URL);

  // 2. Pin the values that matter for a stable, updatable app identity.
  twaManifest.packageId = PACKAGE_ID;
  twaManifest.appVersionName = APP_VERSION_NAME;
  twaManifest.appVersionCode = APP_VERSION_CODE;
  twaManifest.generatorApp = 'bubblewrap-cli';
  // The app entry point is the CareLink bundle, not the root redirect page.
  twaManifest.startUrl = '/carelink-v6.html';
  twaManifest.display = 'standalone';
  // androidbrowserhelper 2.7.4 requires minSdk 24 (Android 7.0); the
  // Bubblewrap default of 21 fails manifest merging. API 24 covers every
  // phone released since 2016.
  twaManifest.minSdkVersion = 24;
  twaManifest.signingKey = { path: `./${KEYSTORE_FILE}`, alias: KEY_ALIAS };

  const validationError = twaManifest.validate();
  if (validationError) {
    throw new Error(`TWA manifest validation failed: ${validationError}`);
  }

  // 3. Save twa-manifest.json and generate the Android project.
  const manifestFile = path.join(ANDROID_DIR, 'twa-manifest.json');
  await twaManifest.saveToFile(manifestFile);
  log('Saved twa-manifest.json');

  const generator = new TwaGenerator();
  const genLog = new BufferedLog(new ConsoleLog('Generating TWA'));
  await generator.createTwaProject(ANDROID_DIR, twaManifest, genLog, () => {});
  genLog.flush();
  log('Android project generated');

  // 4. Write the checksum file so `bubblewrap build` does not prompt to update.
  const manifestContents = await fs.promises.readFile(manifestFile);
  await fs.promises.writeFile(
    path.join(ANDROID_DIR, 'manifest-checksum.txt'),
    computeChecksum(manifestContents),
  );
  log('Wrote manifest-checksum.txt');

  // 5. Generate the signing keystore (reused by `bubblewrap build`).
  const keystorePath = path.join(ANDROID_DIR, KEYSTORE_FILE);
  if (fs.existsSync(keystorePath)) {
    log('Keystore already exists — keeping it');
  } else {
    log('Generating signing keystore with keytool…');
    execFileSync(
      'keytool',
      [
        '-genkeypair',
        '-keystore', keystorePath,
        '-alias', KEY_ALIAS,
        '-keyalg', 'RSA',
        '-keysize', '2048',
        '-validity', '10000',
        '-storepass', KEYSTORE_PASSWORD,
        '-keypass', KEY_PASSWORD,
        '-dname', 'CN=CareLink, OU=LOMAMO Foundation, O=LOMAMO Foundation, L=Kisumu, ST=Kisumu County, C=KE',
      ],
      { stdio: 'inherit' },
    );
    log('Keystore generated');
  }

  // 6. Record the key details for the artifact bundle.
  const keyInfo = [
    'CareLink Android signing key — KEEP THIS FILE SAFE',
    '===================================================',
    `Keystore file : ${KEYSTORE_FILE}`,
    `Key alias     : ${KEY_ALIAS}`,
    `Keystore pass : ${KEYSTORE_PASSWORD}`,
    `Key pass      : ${KEY_PASSWORD}`,
    '',
    'Every future update to the CareLink Android app MUST be signed with this',
    'same key. If you lose it, existing installs cannot be updated — users must',
    'uninstall and reinstall. Store a copy somewhere safe (e.g. a password',
    'manager or a USB stick), separate from this repository.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ANDROID_DIR, 'signing-key-info.txt'), keyInfo, 'utf8');

  log('Done. Next step: run `bubblewrap build` in the android directory.');
}

main().catch((error) => {
  console.error(`[build-android] FAILED: ${error && error.message ? error.message : error}`);
  process.exit(1);
});
