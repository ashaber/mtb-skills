/**
 * Google Apps Script — MTB Skills Conference Feedback Backend
 *
 * Handles two payload types:
 *   type: 'feedback'   → logs to "Feedback" sheet, saves drawings/screenshots to Drive
 *   type: 'engagement' → logs to "Engagement" sheet
 *
 * Setup: see README.md in this directory.
 */

const SHEET_ID = 'REPLACE_WITH_YOUR_SHEET_ID';
const DRIVE_FOLDER_NAME = 'MTB Skills Feedback Images';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.type === 'feedback') {
      _handleFeedback(payload);
    } else if (payload.type === 'engagement') {
      _handleEngagement(payload);
    }
    return _ok();
  } catch (err) {
    return _error(err.message);
  }
}

function doGet(e) {
  return ContentService.createTextOutput('MTB Skills Feedback API is running.');
}

// ── Feedback handler ──────────────────────────────────────────────────────────

function _handleFeedback(p) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = _getOrCreateSheet(ss, 'Feedback', [
    'Timestamp', 'Date', 'Page', 'Role', 'User Name', 'NICA League', 'Team',
    'Comment', 'Has Drawing', 'Drawing URL', 'Screenshot URL',
  ]);

  const folder = _getOrCreateFolder();
  const drawingUrl    = p.hasDrawing && p.drawingUrl    ? _saveImage(folder, p.drawingUrl,    'drawing_'    + Date.now() + '.png') : '';
  const screenshotUrl = p.screenshotUrl                 ? _saveImage(folder, p.screenshotUrl, 'screenshot_' + Date.now() + '.png') : '';

  sheet.appendRow([
    new Date().toISOString(),
    new Date().toLocaleDateString(),
    p.page        || '',
    p.role        || '',
    p.userName    || '',
    p.league      || '',
    p.team        || '',
    p.comment     || '',
    p.hasDrawing  ? 'Yes' : 'No',
    drawingUrl,
    screenshotUrl,
  ]);
}

// ── Engagement handler ────────────────────────────────────────────────────────

function _handleEngagement(p) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = _getOrCreateSheet(ss, 'Engagement', [
    'Timestamp', 'Session ID', 'Session Start', 'Duration(s)',
    'User Name', 'NICA League', 'Team', 'Event Count', 'Events JSON',
  ]);

  sheet.appendRow([
    new Date().toISOString(),
    p.sessionId    || '',
    p.sessionStart || '',
    p.durationSec  || 0,
    p.userName     || '',
    p.league       || '',
    p.team         || '',
    p.eventCount   || 0,
    p.events       || '[]',
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function _getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function _saveImage(folder, dataUrl, filename) {
  try {
    const [, b64] = dataUrl.split(',');
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch {
    return '';
  }
}

function _ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function _error(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
