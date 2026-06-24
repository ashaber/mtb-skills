/**
 * Google Apps Script — MTB Skills Conference Feedback Backend
 *
 * Handles two payload types:
 *   type: 'feedback'   → logs to "Feedback" sheet, saves drawings/screenshots to Drive
 *   type: 'engagement' → logs to "Engagement" sheet
 *
 * Setup: create this script from INSIDE the Google Sheet
 *   (Extensions → Apps Script), not as a standalone script.
 *   This keeps permissions scoped to just this spreadsheet + files
 *   the script creates. See README.md for full setup steps.
 */

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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _getOrCreateSheet(ss, 'Feedback', [
    'Timestamp', 'Date', 'Page', 'Role', 'User Name', 'Email', 'NICA League', 'Team',
    'Comment', 'Has Drawing', 'Drawing URL', 'Screenshot URL', 'Error',
  ]);

  const folder = _getOrCreateFolder();

  let drawingUrl = '';
  let drawError  = '';
  if (p.hasDrawing && p.drawingUrl) {
    const result = _saveImageSafe(folder, p.drawingUrl, 'drawing_' + Date.now() + '.png');
    drawingUrl = result.url;
    drawError  = result.error;
  }
  const screenshotUrl = p.screenshotUrl ? _saveImage(folder, p.screenshotUrl, 'screenshot_' + Date.now() + '.png') : '';

  sheet.appendRow([
    new Date().toISOString(),
    new Date().toLocaleDateString(),
    p.page        || '',
    p.role        || '',
    p.userName    || '',
    p.email       || '',
    p.league      || '',
    p.team        || '',
    p.comment     || '',
    p.hasDrawing  ? 'Yes' : 'No',
    drawingUrl,
    screenshotUrl,
    drawError,
  ]);
}

// ── Engagement handler ────────────────────────────────────────────────────────

function _handleEngagement(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('DRIVE_FOLDER_ID');
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (e) {}
  }
  const folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function _saveImage(folder, dataUrl, filename) {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return '';
    const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), 'image/png', filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch {
    return '';
  }
}

function _saveImageSafe(folder, dataUrl, filename) {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) throw new Error('malformed data URL — no base64 segment');
    const b64 = parts[1];
    if (!b64 || b64.length < 10) throw new Error('base64 payload empty or too short (' + b64?.length + ' chars)');
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { url: file.getUrl(), error: '' };
  } catch (err) {
    return { url: '', error: err.message };
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
