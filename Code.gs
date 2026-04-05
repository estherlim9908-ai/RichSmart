// ============================================================
// RichSmart — Google Apps Script Backend (Code.gs)
// Deploy as Web App: Execute as Me, Anyone can access
// ============================================================

const SPREADSHEET_ID = ''; // ← PASTE YOUR GOOGLE SHEET ID HERE
const SHEETS = {
  TRANSACTIONS:    'Transactions',
  FIXED_EXPENSES:  'FixedExpenses',
  SAVINGS_GOALS:   'SavingsGoals',
  PLANNED_EVENTS:  'PlannedEvents',
  INVESTMENTS:     'Investments',
  NET_WORTH:       'NetWorth',
  SETTINGS:        'Settings',
  BUDGET:          'Budget',
};

// ── CORS Helper ──────────────────────────────────────────────
function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET Handler ──────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action || 'all';
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let result = {};

    if (action === 'all') {
      result = {
        transactions:   sheetToJSON(ss, SHEETS.TRANSACTIONS),
        fixedExpenses:  sheetToJSON(ss, SHEETS.FIXED_EXPENSES),
        savingsGoals:   sheetToJSON(ss, SHEETS.SAVINGS_GOALS),
        plannedEvents:  sheetToJSON(ss, SHEETS.PLANNED_EVENTS),
        investments:    sheetToJSON(ss, SHEETS.INVESTMENTS),
        netWorth:       sheetToJSON(ss, SHEETS.NET_WORTH),
        settings:       sheetToJSON(ss, SHEETS.SETTINGS),
        budget:         sheetToJSON(ss, SHEETS.BUDGET),
      };
    } else if (SHEETS[action.toUpperCase()]) {
      result = sheetToJSON(ss, SHEETS[action.toUpperCase()]);
    }

    return corsResponse({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (err) {
    return corsResponse({ success: false, error: err.message });
  }
}

// ── POST Handler ─────────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { action, sheet, data, id } = payload;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    let result;
    switch (action) {
      case 'insert': result = insertRow(ss, sheet, data); break;
      case 'update': result = updateRow(ss, sheet, id, data); break;
      case 'delete': result = deleteRow(ss, sheet, id); break;
      case 'upsert': result = upsertRow(ss, sheet, data); break;
      case 'bulkWrite': result = bulkWrite(ss, sheet, data); break;
      default: throw new Error('Unknown action: ' + action);
    }

    return corsResponse({ success: true, result, timestamp: new Date().toISOString() });
  } catch (err) {
    return corsResponse({ success: false, error: err.message });
  }
}

// ── Sheet Helpers ─────────────────────────────────────────────
function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    initSheet(sheet, name);
  }
  return sheet;
}

function initSheet(sheet, name) {
  const headers = {
    [SHEETS.TRANSACTIONS]:   ['id','date','category','amount','description','paymentMethod','month','createdAt'],
    [SHEETS.FIXED_EXPENSES]:  ['id','name','budgeted','actual','cardMethod','notes','isInstalment','monthsRemaining','endDate','remainingBalance','month','updatedAt'],
    [SHEETS.SAVINGS_GOALS]:   ['id','name','target','targetDate','monthlyContrib','currentAmount','notes','createdAt','updatedAt'],
    [SHEETS.PLANNED_EVENTS]:  ['id','name','category','amount','date','notes','status','actualAmount','month','createdAt','updatedAt'],
    [SHEETS.INVESTMENTS]:     ['id','month','type','amount','platform','notes','createdAt'],
    [SHEETS.NET_WORTH]:       ['id','key','value','category','notes','updatedAt'],
    [SHEETS.SETTINGS]:        ['key','value','updatedAt'],
    [SHEETS.BUDGET]:          ['id','category','budget','month','updatedAt'],
  };
  if (headers[name]) {
    sheet.appendRow(headers[name]);
    sheet.getRange(1, 1, 1, headers[name].length).setFontWeight('bold');
  }
}

function sheetToJSON(ss, sheetName) {
  const sheet = getOrCreateSheet(ss, sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
    return obj;
  });
}

function insertRow(ss, sheetName, data) {
  const sheet = getOrCreateSheet(ss, sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  data.id = data.id || Utilities.getUuid();
  data.createdAt = data.createdAt || new Date().toISOString();
  const row = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.appendRow(row);
  return { id: data.id };
}

function updateRow(ss, sheetName, id, data) {
  const sheet = getOrCreateSheet(ss, sheetName);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIdx = headers.indexOf('id');
  if (idIdx === -1) return updateByKey(ss, sheetName, id, data);

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idIdx] === id) {
      data.updatedAt = new Date().toISOString();
      headers.forEach((h, j) => {
        if (data[h] !== undefined) sheet.getRange(i + 1, j + 1).setValue(data[h]);
      });
      return { updated: id };
    }
  }
  return insertRow(ss, sheetName, { ...data, id });
}

function updateByKey(ss, sheetName, key, data) {
  const sheet = getOrCreateSheet(ss, sheetName);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const keyIdx = headers.indexOf('key');

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][keyIdx] === key) {
      data.updatedAt = new Date().toISOString();
      headers.forEach((h, j) => {
        if (data[h] !== undefined) sheet.getRange(i + 1, j + 1).setValue(data[h]);
      });
      return { updated: key };
    }
  }
  return insertRow(ss, sheetName, { key, ...data });
}

function deleteRow(ss, sheetName, id) {
  const sheet = getOrCreateSheet(ss, sheetName);
  const allData = sheet.getDataRange().getValues();
  const idIdx = allData[0].indexOf('id');
  for (let i = allData.length - 1; i >= 1; i--) {
    if (allData[i][idIdx] === id) {
      sheet.deleteRow(i + 1);
      return { deleted: id };
    }
  }
  return { notFound: id };
}

function upsertRow(ss, sheetName, data) {
  if (data.id) return updateRow(ss, sheetName, data.id, data);
  return insertRow(ss, sheetName, data);
}

function bulkWrite(ss, sheetName, rows) {
  const sheet = getOrCreateSheet(ss, sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  // Clear data rows (keep header)
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
  rows.forEach(row => {
    const r = headers.map(h => row[h] !== undefined ? row[h] : '');
    sheet.appendRow(r);
  });
  return { written: rows.length };
}

// ── Setup Helper ─────────────────────────────────────────────
// Run this once manually to initialize all sheets
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.values(SHEETS).forEach(name => getOrCreateSheet(ss, name));
  Logger.log('All sheets initialized!');
}
