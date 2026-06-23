# Conference Feedback — Sheets Backend Setup

One-time setup before the conference. Takes about 10 minutes.

## Step 1 — Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it "MTB Skills Conference Feedback".

## Step 2 — Create the Apps Script

1. In the spreadsheet, click **Extensions → Apps Script**.
2. Delete the default `myFunction` code.
3. Paste the contents of `setup/google-apps-script.js` from this repo.
4. Click **Save** (Ctrl+S / Cmd+S).

> **Important:** Create the script from *inside* the spreadsheet (Extensions → Apps Script),
> not as a standalone script. This keeps OAuth permissions scoped to just this spreadsheet
> and files the script creates — no broad Drive/Sheets access required.

## Step 3 — Deploy as a web app

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Description:** MTB Skills Feedback v1
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. Copy the **Web app URL** — it looks like:  
   `https://script.google.com/macros/s/<ID>/exec`

## Step 4 — Wire up the URL in the app

**Option A — in DevTools (quick test):**
```javascript
localStorage.setItem('mtb_sheets_url', 'https://script.google.com/macros/s/<ID>/exec');
```

**Option B — hardcode before the conference (permanent):**

In `index.html`, add this before the `<script type="module">` tag:
```html
<script>
  window.MTB_SHEETS_URL = 'https://script.google.com/macros/s/<ID>/exec';
</script>
```
Then commit, push, let CI deploy to GitHub Pages.

## Step 5 — Verify

1. Open the app at `https://ashaber.github.io/mtb-skills/?feedback=true`.
2. Complete the session overlay (select Coach or Athlete).
3. Click the **💬 Feedback** button and submit a test comment.
4. Check the Google Sheet — a new row should appear in the "Feedback" sheet within a few seconds.

## How it works

- **Normal app URL** (`/mtb-skills/`) — zero feedback code runs.
- **Conference URL** (`/mtb-skills/?feedback=true`) — loads `src/feedback.js`, shows the session overlay, adds the floating feedback button.
- **Offline:** If the Sheets URL is unreachable, feedback is queued in `localStorage` under `mtb_pending_*` keys and flushed on the next successful connection.
- **Images:** Drawings and screenshots are saved as PNGs in a "MTB Skills Feedback Images" folder in your Google Drive and linked in the sheet.

## Where to find feedback responses

After Step 4 is complete and people start submitting:

1. Open your **Google Sheet** (the one you created in Step 1).
2. Two sheets appear after the first submissions:
   - **Feedback** — one row per submission: timestamp, page, role, name, league, comment, drawing/screenshot URLs
   - **Engagement** — one row per engagement flush (every 15 events or every 60s): session ID, duration, event count, full events JSON
3. Drawing and screenshot images are saved to a **"MTB Skills Feedback Images"** folder in your Google Drive. Each row in the Feedback sheet contains direct links to those files.

At the conference, check the sheet on your phone or laptop — new rows appear within a few seconds of each submission.

## Troubleshooting

- **"Script not found" error:** Re-deploy the web app — Apps Script URLs change on each deployment.
- **No rows appearing:** Open browser DevTools → Network tab → look for failed POST requests to the script URL.
- **Rows appear but images are empty:** Large images may fail base64 encoding. The URL columns will be blank but the text comment will still save.
