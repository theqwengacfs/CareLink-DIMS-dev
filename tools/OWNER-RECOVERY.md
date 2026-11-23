# Chief account recovery — database owner only

This tool is for the owner of the CareLink database. It is not a public web
recovery endpoint. It requires a trusted computer with Node.js 18 or later,
an internet connection, and the **writable Upstash REST URL and REST token**
for the exact database used by the live CareLink deployment. Never post those
values or a password in chat, a repository, or screenshots. A read-only token
will not work. Make a database backup first if one is available.

1. Locate the Upstash Redis database connected to the CareLink Vercel project.
   In Upstash, open that database and locate its REST URL and writable REST
   token. Compare the URL to the deployed Vercel project's environment settings
   to ensure it is the right database. Do not change any environment variables.
2. Open a terminal in the extracted recovery folder (or the repository root).
   Run:

   ```text
   node tools/recover-chief.mjs
   ```

3. Enter the Upstash REST URL and writable token. The tool reads the database
   and displays the existing Chief account name and username on your computer.
   If there is more than one, select the account to recover by its number.
   Keep the shown username so you can sign in; do not share it here.
4. If a Chief browser is **pending**, the tool shows only pending devices already
   associated with the selected Chief account. To approve your own recovery
   browser, match its sign-in device code through a trusted channel, then paste
   the **exact full device ID** shown in the tool. Labels are untrusted; never
   select a browser on its name alone. Press Enter for password-only recovery.
   New browsers are normally registered automatically after successful password verification; this optional legacy recovery action is not required for ordinary sign-in. Explicitly rejected or revoked browsers remain blocked.
5. Choose and repeat a new private password. The token and password are hidden
   while typing. The password must be at least 12 characters, with uppercase,
   lowercase, a number and a symbol; it cannot contain your username, the
   organisation name, or common words such as `password`.
6. Type `RECOVER` only after confirming the correct database, account and any
   explicitly selected pending device. Keep the terminal open; on larger
   databases the tool reports upload progress and may take several minutes.
   Only after it reports `Recovery saved`, sign in at
   <https://care-link-dims-dev-three.vercel.app/> with the new password.

After password-only recovery, sign in using the new password from a browser that
has not been explicitly rejected or revoked. The host automatically registers a
new or previously pending browser after password verification. This does not
reopen the one-time commissioning/migration bootstrap.

The tool changes only the named existing Chief credential and its login state,
revokes old Chief sessions and codes, and writes an audit event. It preserves
other accounts and records. It does **not** rebuild the hierarchy or issue
staff passwords. If the connection fails after a write, try the new password
before rerunning; the save might have succeeded despite a lost response. If the
database changes concurrently, rerun the tool; it will not overwrite that
change. If an upload part fails before the commit, the password was not changed
by that attempt. Check the internet connection and the database status before
retrying; do not delete or re-create the database. Resetting the Chief password makes any undownloaded, password-encrypted
reactivation pack issued under the old password unrecoverable.

After sign-in, the Chief may explicitly start the hierarchy rebuild and download
the confidential staff credential document. Use a trusted computer and keep
the token private. Nothing is sent to an AI assistant or stored in a file by
the tool. Its requests go directly to the Upstash database over HTTPS.
