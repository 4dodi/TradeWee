/**
 * Tradewee → Google Sheets
 * Paste this whole script into your spreadsheet: Extensions → Apps Script.
 * Then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)
 * and paste the Web app URL into Tradewee's settings.
 *
 * Only requests carrying the TOKEN below can write to the sheet. Keep it private.
 * Source: https://github.com/4dodi/TradeWee — MIT license
 */
const TOKEN = '{{TOKEN}}';
const SHEET_NAME = 'Tradewee';

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'Invalid JSON' });
  }
  if (!data || data.token !== TOKEN) return reply({ ok: false, error: 'Invalid token' });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (data.action === 'ping') return reply({ ok: true, name: ss.getName(), sheetUrl: ss.getUrl() });
  if (data.action !== 'save' || !Array.isArray(data.row) || !Array.isArray(data.headers)) {
    return reply({ ok: false, error: 'Unknown action' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(data.headers);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, data.headers.length).setFontWeight('bold');
    }
    // The last column holds the Tradewee ID: saving the same analysis again updates its row
    const idCol = data.headers.length;
    let row = 0;
    if (sheet.getLastRow() > 1) {
      const found = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1)
        .createTextFinder(String(data.id)).matchEntireCell(true).findNext();
      if (found) row = found.getRow();
    }
    const updated = row > 0;
    if (updated) {
      sheet.getRange(row, 1, 1, data.row.length).setValues([data.row]);
    } else {
      sheet.appendRow(data.row);
      row = sheet.getLastRow();
    }
    return reply({ ok: true, row: row, updated: updated, sheetUrl: ss.getUrl() + '#gid=' + sheet.getSheetId() });
  } finally {
    lock.releaseLock();
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
