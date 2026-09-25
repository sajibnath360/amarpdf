# AmarPDF support-reaction email notifications

The static GitHub Pages site cannot send Gmail mail directly. This project includes a tiny Google Apps Script mail bridge.

## One-time setup

1. Open Google Apps Script while signed into the Google account that should send the notifications.
2. Create a new project.
3. Copy the contents of `google-apps-script/Code.gs` into the project and save it.
4. Deploy it as a **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployed URL ending in `/exec`.
6. Open `app.js` in AmarPDF and find:

   `const SUPPORT_NOTIFY_ENDPOINT = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";`

7. Replace the placeholder with your `/exec` URL, keeping the quotes.
8. Save the file and upload the updated AmarPDF files to GitHub Pages.

## What happens

Every time a visitor clicks the required heart in the download popup, AmarPDF sends a small POST request to the Apps Script. Apps Script sends an email to:

`sajibkumarnath360@gmail.com`

The email includes the AmarPDF tool, timestamp, and browser user-agent.

The download is not blocked if the email service itself happens to fail: the heart reaction still unlocks the file. This keeps the user's download reliable while the notification remains best-effort.

## Important

Do not put a Gmail password, app password, or other private credential in `app.js`. The Apps Script owns the mail-sending permission.
