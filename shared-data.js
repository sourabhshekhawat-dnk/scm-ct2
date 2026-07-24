/* ============================================================
   SHARED DATA LAYER   - Supabase backend edition
   All parsed Excel data and config is stored in Supabase
   (scm_ct_data table) instead of localStorage, so every
   device/browser sees the same data without re-uploading.
   ============================================================ */

/* ---------- SUPABASE CLIENT ---------- */
const SUPABASE_URL  = 'https://lmlcsxwifipydbvwyixm.supabase.co';
const SUPABASE_ANON = 'sb_publishable_3q64pceuW-MV65MKfjhpAQ_4Wnf-ilK';

// Lightweight wrapper  - no npm, just the REST API via fetch.
// Every key maps to a row in the scm_ct_data table.
const DB = {
  async get(key) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scm_ct_data?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    if (!res.ok) throw new Error(`DB.get failed: ${res.status}`);
    const rows = await res.json();
    return rows.length ? rows[0].value : null;
  },

  async set(key, value) {
    // value is already a string (stringified by dbSet before calling here)
    const body = JSON.stringify({ key, value });
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scm_ct_data`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal,resolution=merge-duplicates',
        },
        body,
      }
    );
    if (!res.ok) { const t = await res.text(); throw new Error(`DB.set failed: ${res.status} ${t}`); }
  },

  async del(key) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scm_ct_data?key=eq.${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
      }
    );
    if (!res.ok) throw new Error(`DB.del failed: ${res.status}`);
  },

  async delMany(keys) {
    await Promise.all(keys.map(k => DB.del(k)));
  },
};

// ── In-memory cache so repeated reads within a page session don't re-fetch ──
const _cache = {};

// Prefetch ALL keys in one request and warm the cache — call this once on page load
// before any individual dbGet calls. Cuts N round-trips down to 1.
async function dbPrefetch() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scm_ct_data?select=key,value`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    if (!res.ok) return;
    const rows = await res.json();
    rows.forEach(r => { _cache[r.key] = r.value; });
  } catch (e) {
    // Prefetch failed — individual dbGet calls will still work, just slower
    console.warn('dbPrefetch failed:', e.message);
  }
}

async function dbGet(key) {
  if (_cache[key] !== undefined) return _cache[key];
  const val = await DB.get(key);
  _cache[key] = val;
  return val;
}
async function dbSet(key, value) {
  const strVal = typeof value === 'string' ? value : JSON.stringify(value);
  _cache[key] = strVal;
  await DB.set(key, strVal);  // DB.set receives a string, stores it as-is
}
async function dbDel(key) {
  delete _cache[key];
  await DB.del(key);
}
async function dbDelMany(keys) {
  keys.forEach(k => delete _cache[k]);
  await DB.delMany(keys);
}

// ── Helper: parse stored JSON, return null if missing/invalid ──
function parseStored(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/* ---------- STORAGE KEYS ---------- */
const STORAGE_KEYS = {
  CNDN_URL:           'ct_cndn_sheet_url',
  FILLRATE_DATA:      'ct_fillrate_parsed_data',
  FILLRATE_FILENAME:  'ct_fillrate_filename',
  FILLRATE_UPLOADED_AT: 'ct_fillrate_uploaded_at',
  REVLOG_BASE_URL:    'ct_revlog_base_url',
  REVLOG_GID_MAP:     'ct_revlog_gid_map',
  OTD_DATA:           'ct_otd_parsed_data',
  OTD_FILENAME:       'ct_otd_filename',
  OTD_UPLOADED_AT:    'ct_otd_uploaded_at',
  ATP_DATA:           'ct_atp_parsed_data',
  ATP_FILENAME:       'ct_atp_filename',
  ATP_UPLOADED_AT:    'ct_atp_uploaded_at',
};

/* ---------- CN/DN CONFIG ---------- */
async function getCNDNUrl()       { return (await dbGet(STORAGE_KEYS.CNDN_URL)) || ''; }
async function setCNDNUrl(url)    { await dbSet(STORAGE_KEYS.CNDN_URL, url); }
async function clearCNDN()        { await dbDel(STORAGE_KEYS.CNDN_URL); }

/* ---------- FILL RATE CONFIG ---------- */
async function getStoredFillRate()                  { return parseStored(await dbGet(STORAGE_KEYS.FILLRATE_DATA)); }
async function setStoredFillRate(parsed, filename)  {
  await Promise.all([
    dbSet(STORAGE_KEYS.FILLRATE_DATA, JSON.stringify(parsed)),
    dbSet(STORAGE_KEYS.FILLRATE_FILENAME, filename),
    dbSet(STORAGE_KEYS.FILLRATE_UPLOADED_AT, new Date().toISOString()),
  ]);
}
async function getFillRateMeta() {
  const [filename, uploadedAt] = await Promise.all([
    dbGet(STORAGE_KEYS.FILLRATE_FILENAME),
    dbGet(STORAGE_KEYS.FILLRATE_UPLOADED_AT),
  ]);
  return { filename: filename || null, uploadedAt: uploadedAt || null };
}
async function clearFillRate() {
  await dbDelMany([STORAGE_KEYS.FILLRATE_DATA, STORAGE_KEYS.FILLRATE_FILENAME, STORAGE_KEYS.FILLRATE_UPLOADED_AT]);
}

/* ---------- REV LOGISTICS B2B CONFIG ---------- */
async function getRevLogBaseUrl()       { return (await dbGet(STORAGE_KEYS.REVLOG_BASE_URL)) || ''; }
async function setRevLogBaseUrl(url)    { await dbSet(STORAGE_KEYS.REVLOG_BASE_URL, url); }
async function getRevLogGidMap()        { return parseStored(await dbGet(STORAGE_KEYS.REVLOG_GID_MAP)) || {}; }
async function setRevLogGidMap(map)     { await dbSet(STORAGE_KEYS.REVLOG_GID_MAP, JSON.stringify(map)); }
async function addRevLogGid(monthName, gid) {
  const map = await getRevLogGidMap();
  map[monthName] = gid;
  await setRevLogGidMap(map);
}
async function clearRevLog() {
  await dbDelMany([STORAGE_KEYS.REVLOG_BASE_URL, STORAGE_KEYS.REVLOG_GID_MAP]);
}

function getCurrentMonthName() {
  return new Date().toLocaleString('en-US', { month: 'long' });
}

/* ---------- OTD B2B SECONDARY CONFIG ---------- */
async function getStoredOTD()                 { return parseStored(await dbGet(STORAGE_KEYS.OTD_DATA)); }
async function setStoredOTD(parsed, filename) {
  await Promise.all([
    dbSet(STORAGE_KEYS.OTD_DATA, JSON.stringify(parsed)),
    dbSet(STORAGE_KEYS.OTD_FILENAME, filename),
    dbSet(STORAGE_KEYS.OTD_UPLOADED_AT, new Date().toISOString()),
  ]);
}
async function getOTDMeta() {
  const [filename, uploadedAt] = await Promise.all([
    dbGet(STORAGE_KEYS.OTD_FILENAME),
    dbGet(STORAGE_KEYS.OTD_UPLOADED_AT),
  ]);
  return { filename: filename || null, uploadedAt: uploadedAt || null };
}
async function clearOTD() {
  await dbDelMany([STORAGE_KEYS.OTD_DATA, STORAGE_KEYS.OTD_FILENAME, STORAGE_KEYS.OTD_UPLOADED_AT]);
}

/* ---------- ATP CONFIG ---------- */
async function getStoredATP()                 { return parseStored(await dbGet(STORAGE_KEYS.ATP_DATA)); }
async function setStoredATP(parsed, filename) {
  await Promise.all([
    dbSet(STORAGE_KEYS.ATP_DATA, JSON.stringify(parsed)),
    dbSet(STORAGE_KEYS.ATP_FILENAME, filename),
    dbSet(STORAGE_KEYS.ATP_UPLOADED_AT, new Date().toISOString()),
  ]);
}
async function getATPMeta() {
  const [filename, uploadedAt] = await Promise.all([
    dbGet(STORAGE_KEYS.ATP_FILENAME),
    dbGet(STORAGE_KEYS.ATP_UPLOADED_AT),
  ]);
  return { filename: filename || null, uploadedAt: uploadedAt || null };
}
async function clearATP() {
  await dbDelMany([STORAGE_KEYS.ATP_DATA, STORAGE_KEYS.ATP_FILENAME, STORAGE_KEYS.ATP_UPLOADED_AT]);
}

/* ---------- R2R CONFIG ---------- */
async function getStoredR2R()                 { return parseStored(await dbGet('ct_r2r_parsed_data')); }
async function setStoredR2R(parsed, filename) {
  await Promise.all([
    dbSet('ct_r2r_parsed_data', JSON.stringify(parsed)),
    dbSet('ct_r2r_filename', filename),
    dbSet('ct_r2r_uploaded_at', new Date().toISOString()),
  ]);
}
async function getR2RMeta() {
  const [filename, uploadedAt] = await Promise.all([
    dbGet('ct_r2r_filename'),
    dbGet('ct_r2r_uploaded_at'),
  ]);
  return { filename: filename || null, uploadedAt: uploadedAt || null };
}
async function clearR2R() {
  await dbDelMany(['ct_r2r_parsed_data', 'ct_r2r_filename', 'ct_r2r_uploaded_at']);
}

/* ---------- D2C CONFIG ---------- */
async function getStoredD2C()                 { return parseStored(await dbGet('ct_d2c_parsed_data')); }
async function setStoredD2C(parsed, filename) {
  await Promise.all([
    dbSet('ct_d2c_parsed_data', JSON.stringify(parsed)),
    dbSet('ct_d2c_filename', filename),
    dbSet('ct_d2c_uploaded_at', new Date().toISOString()),
  ]);
}
async function getD2CMeta() {
  const [filename, uploadedAt] = await Promise.all([
    dbGet('ct_d2c_filename'),
    dbGet('ct_d2c_uploaded_at'),
  ]);
  return { filename: filename || null, uploadedAt: uploadedAt || null };
}
async function clearD2C() {
  await dbDelMany(['ct_d2c_parsed_data', 'ct_d2c_filename', 'ct_d2c_uploaded_at']);
}

/* ---------- OTD PRIMARY CONFIG ---------- */
async function getStoredOTDPrimary()                 { return parseStored(await dbGet('ct_otdprimary_parsed_data')); }
async function setStoredOTDPrimary(parsed, filename) {
  await Promise.all([
    dbSet('ct_otdprimary_parsed_data', JSON.stringify(parsed)),
    dbSet('ct_otdprimary_filename', filename),
    dbSet('ct_otdprimary_uploaded_at', new Date().toISOString()),
  ]);
}
async function getOTDPrimaryMeta() {
  const [filename, uploadedAt] = await Promise.all([
    dbGet('ct_otdprimary_filename'),
    dbGet('ct_otdprimary_uploaded_at'),
  ]);
  return { filename: filename || null, uploadedAt: uploadedAt || null };
}
async function clearOTDPrimary() {
  await dbDelMany(['ct_otdprimary_parsed_data', 'ct_otdprimary_filename', 'ct_otdprimary_uploaded_at']);
}

/* ---------- INVENTORY (SAI & DOH) CONFIG ---------- */
async function getStoredInventory()                 { return parseStored(await dbGet('ct_inv_sai_data')); }
async function setStoredInventory(rows, filename) {
  await Promise.all([
    dbSet('ct_inv_sai_data', JSON.stringify(rows)),
    dbSet('ct_inv_sai_filename', filename),
    dbSet('ct_inv_sai_uploaded_at', new Date().toISOString()),
  ]);
}
async function getInventoryMeta() {
  const [filename, uploadedAt] = await Promise.all([
    dbGet('ct_inv_sai_filename'),
    dbGet('ct_inv_sai_uploaded_at'),
  ]);
  return { filename: filename || null, uploadedAt: uploadedAt || null };
}
async function clearInventory() {
  await dbDelMany(['ct_inv_sai_data', 'ct_inv_sai_filename', 'ct_inv_sai_uploaded_at']);
}

/* ---------- PARSE FILL RATE EXCEL ---------- */
// Returns { overall, totalPO, totalDisp, zoneAgg: {Zone: {po,disp}}, channelAgg: {Channel: {po,disp}} }
function parseFillRateWorkbook(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const sheetName = wb.SheetNames.includes('PO_DATA') ? 'PO_DATA' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1 });
  const headers = rows[0];
  const poIdx = headers.indexOf('PO Quantity');
  const dispIdx = headers.indexOf('Dispatch Quantity');
  const zoneIdx = headers.indexOf('Zone');
  const channelIdx = headers.indexOf('Channel Name');

  if (poIdx === -1 || dispIdx === -1) {
    throw new Error('Could not find PO Quantity / Dispatch Quantity columns in sheet "' + sheetName + '".');
  }

  let totalPO = 0, totalDisp = 0;
  const zoneAgg = {}, channelAgg = {};

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[poIdx] == null) continue;
    const po = Number(r[poIdx]) || 0;
    const disp = Number(r[dispIdx]) || 0;
    totalPO += po; totalDisp += disp;
    if (zoneIdx > -1 && r[zoneIdx]) {
      const z = r[zoneIdx];
      zoneAgg[z] = zoneAgg[z] || { po: 0, disp: 0 };
      zoneAgg[z].po += po; zoneAgg[z].disp += disp;
    }
    if (channelIdx > -1 && r[channelIdx]) {
      const c = r[channelIdx];
      channelAgg[c] = channelAgg[c] || { po: 0, disp: 0 };
      channelAgg[c].po += po; channelAgg[c].disp += disp;
    }
  }

  return {
    overall: totalPO ? (totalDisp / totalPO * 100) : 0,
    totalPO, totalDisp, zoneAgg, channelAgg,
    rowCount: rows.length - 1,
  };
}

/* ---------- FETCH + PARSE CN/DN GOOGLE SHEET ---------- */
// Uses Papa Parse to correctly handle quoted multiline fields and embedded commas
// that a naive split('\n') / regex parser breaks on.
async function fetchCNDNData(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Sheet fetch failed: HTTP ' + res.status);
  let csvText = await res.text();

  // Source sheet has column headers on row 2, not row 1 (row 1 is a title/
  // blank spacer row) - strip that first line so Papa Parse's header:true
  // picks up the real header row.
  const firstNewline = csvText.indexOf('\n');
  if (firstNewline !== -1) csvText = csvText.slice(firstNewline + 1);

  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      transform: v => v.trim(),
      complete: results => {
        if (!results.data.length) { reject(new Error('Sheet returned no rows.')); return; }
        resolve(processCNDNRows(results.data));
      },
      error: err => reject(new Error('CSV parse error: ' + err.message)),
    });
  });
}

function processCNDNRows(rows) {
  const closureCol = 'Closure Status';
  const bucketCol = 'Ageing bucket';
  const typeCol = 'Type of Mismatch';

  const total = rows.length;
  const closedUnder30 = rows.filter(r => r[closureCol] === 'Closed' && (r[bucketCol] === '0 to 15' || r[bucketCol] === '16 to 30')).length;
  const pct = total ? (closedUnder30 / total * 100) : 0;

  const buckets = {};
  ['0 to 15', '16 to 30', '31 to 45', '46 to 60'].forEach(b => {
    buckets[b] = rows.filter(r => r[bucketCol] === b).length;
  });

  const types = {};
  rows.forEach(r => {
    const t = r[typeCol] || 'Unknown';
    types[t] = types[t] || { total: 0, closedUnder30: 0 };
    types[t].total++;
    if (r[closureCol] === 'Closed' && (r[bucketCol] === '0 to 15' || r[bucketCol] === '16 to 30')) types[t].closedUnder30++;
  });

  return { total, closedUnder30, pct, buckets, types, rawCount: rows.length };
}

/* ---------- FETCH + PARSE REV LOGISTICS B2B GOOGLE SHEET ---------- */
// Source workbook has one tab per month (April, May, June, ...). We fetch
// whichever tab's gid matches the CURRENT real-world month, so this is true
// MTD with zero manual swapping once each month's gid is registered.
//
// Rev Logistics B2B % = SUM(Invoice Qty where FWD AWB Status is one of
// ["RTO Delivered", "RTO Initiated Done", "RTO Initiated Pending"])
// ÷ SUM(Invoice Qty, all rows) × 100
const REVLOG_RTO_STATUSES = ['RTO Delivered', 'RTO Initiated Done', 'RTO Initiated Pending'];

async function fetchRevLogB2BData() {
  const baseUrl = await getRevLogBaseUrl();
  const gidMap = await getRevLogGidMap();
  const monthName = getCurrentMonthName();
  const gid = gidMap[monthName];

  if (!baseUrl) throw new Error('No base sheet URL configured.');
  if (!gid) throw new Error(`No tab configured for "${monthName}" yet. Add this month's gid in Config.`);

  // baseUrl looks like ".../pub?output=csv"  - append the gid for this month's tab.
  const separator = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${separator}gid=${gid}&single=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Sheet fetch failed: HTTP ' + res.status);
  const csvText = await res.text();

  const rows = await new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      transform: v => (typeof v === 'string' ? v.trim() : v),
      complete: results => resolve(results.data),
      error: err => reject(new Error('CSV parse error: ' + err.message)),
    });
  });

  if (!rows.length) throw new Error(`"${monthName}" tab returned no rows.`);
  return processRevLogRows(rows, monthName);
}

function processRevLogRows(rows, monthName) {
  const qtyCol    = 'Invoice Qty';
  const statusCol = 'FWD AWB Status';
  const cnValueCol = 'CN Value';   // Putaway Done = RTO Delivered AND CN Value non-blank
                                   // Putaway Pending = RTO Delivered AND CN Value blank
                                   // (mirrors sheet formula: COUNTIFS($AR:$AR,"<>",$Q:$Q,"RTO Delivered"))

  // ── PO-level counters (1 row = 1 PO) ──────────────────────────────────
  let totalPO         = 0;  // all rows
  let rtoTotalPO      = 0;  // any RTO status
  let rtoDeliveredPO  = 0;  // FWD AWB Status = "RTO Delivered"
  let putawayDonePO   = 0;  // RTO Delivered AND CN Value non-blank
  let putawayPendPO   = 0;  // RTO Delivered AND CN Value blank

  // ── Qty-level counters (sum of Invoice Qty column) ────────────────────
  let totalQty        = 0;
  let rtoTotalQty     = 0;
  let rtoDeliveredQty = 0;
  let putawayDoneQty  = 0;
  let putawayPendQty  = 0;

  const byStatus    = {};   // { status: qty }  — for the donut / existing table
  const byStatusPO  = {};   // { status: poCount } — for the new summary table

  rows.forEach(r => {
    const qty     = Number(r[qtyCol]) || 0;
    const status  = (r[statusCol]  || '').trim();
    const cnValue = (r[cnValueCol] != null ? String(r[cnValueCol]).trim() : '');

    totalPO  += 1;
    totalQty += qty;

    if (status) {
      byStatus[status]   = (byStatus[status]   || 0) + qty;
      byStatusPO[status] = (byStatusPO[status] || 0) + 1;
    }

    if (REVLOG_RTO_STATUSES.includes(status)) {
      rtoTotalPO  += 1;
      rtoTotalQty += qty;
    }

    if (status === 'RTO Delivered') {
      rtoDeliveredPO  += 1;
      rtoDeliveredQty += qty;
      // Putaway Done = CN Value is non-blank; Putaway Pending = CN Value is blank
      if (cnValue !== '') {
        putawayDonePO  += 1;
        putawayDoneQty += qty;
      } else {
        putawayPendPO  += 1;
        putawayPendQty += qty;
      }
    }
  });

  const pct = totalQty ? (rtoTotalQty / totalQty * 100) : 0;

  // Derived %s — match the sheet's column formulas exactly
  const putawayDonePct  = rtoDeliveredPO  ? (putawayDonePO  / rtoDeliveredPO  * 100) : 0;
  const putawayPendPct  = rtoDeliveredPO  ? (putawayPendPO  / rtoDeliveredPO  * 100) : 0;
  const rtoInPOPct      = totalPO         ? (rtoTotalPO     / totalPO         * 100) : 0;

  const putawayDoneQtyPct = rtoDeliveredQty ? (putawayDoneQty / rtoDeliveredQty * 100) : 0;
  const putawayPendQtyPct = rtoDeliveredQty ? (putawayPendQty / rtoDeliveredQty * 100) : 0;
  const rtoInQtyPct       = totalQty        ? (rtoTotalQty    / totalQty        * 100) : 0;

  return {
    monthName,
    // legacy fields (donut + scoreboard still use these)
    totalQty, rtoQty: rtoTotalQty, pct, byStatus,
    rowCount: rows.length,
    // PO-level summary
    po: {
      total: totalPO, rtoTotal: rtoTotalPO, rtoDelivered: rtoDeliveredPO,
      putawayDone: putawayDonePO,   putawayDonePct,
      putawayPend: putawayPendPO,   putawayPendPct,
      rtoInPct: rtoInPOPct,
    },
    // Qty-level summary
    qty: {
      total: totalQty, rtoTotal: rtoTotalQty, rtoDelivered: rtoDeliveredQty,
      putawayDone: putawayDoneQty,   putawayDonePct: putawayDoneQtyPct,
      putawayPend: putawayPendQty,   putawayPendPct: putawayPendQtyPct,
      rtoInPct: rtoInQtyPct,
    },
    byStatusPO,
  };
}

/* ---------- FETCH ALL MONTHS for Rev Log B2B month-wise summary ----------
 * Loops through every gid in the gid-map, fetches + parses each tab, and
 * returns an array of processRevLogRows results sorted calendar-order.
 * Missing / failed months are included with a { skipped: true } flag so the
 * table can show a placeholder row instead of silently dropping the month.
 */
async function fetchRevLogB2BAllMonths() {
  const baseUrl = await getRevLogBaseUrl();
  const gidMap  = await getRevLogGidMap();
  if (!baseUrl) throw new Error('No base sheet URL configured.');

  const CAL_ORDER = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

  const entries = Object.entries(gidMap)
    .sort((a, b) => CAL_ORDER.indexOf(a[0]) - CAL_ORDER.indexOf(b[0]));

  if (!entries.length) throw new Error('No months registered in Config yet.');

  const separator = baseUrl.includes('?') ? '&' : '?';

  const results = await Promise.all(entries.map(async ([monthName, gid]) => {
    try {
      const url = `${baseUrl}${separator}gid=${gid}&single=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csvText = await res.text();

      const rows = await new Promise((resolve, reject) => {
        Papa.parse(csvText, {
          header: true, skipEmptyLines: true,
          transformHeader: h => h.trim(),
          transform: v => (typeof v === 'string' ? v.trim() : v),
          complete: r => resolve(r.data),
          error:    e => reject(new Error(e.message)),
        });
      });

      return processRevLogRows(rows, monthName);
    } catch (e) {
      return { monthName, skipped: true, error: e.message };
    }
  }));

  return results;
}

/* ---------- PARSE OTD B2B SECONDARY EXCEL ---------- */
// Source is one continuous sheet (not month-tabs), with a "Month" date column
// per row and a "TAT (Hit/Delay)" verdict column ("Within TAT" / "TAT breach").
// Rows still in transit have no verdict yet and are correctly excluded from
// both numerator and denominator  - OTD only judges POs that have actually
// reached a delivered/RTO outcome.
//
// OTD B2B Secondary % (MTD) =
//   COUNT(rows this month where TAT verdict = "Within TAT")
//   ÷ COUNT(rows this month where TAT verdict is "Within TAT" OR "TAT breach")
//   × 100
function parseOTDWorkbook(arrayBuffer) {
  // IMPORTANT: read with cellDates:false and parse the raw Excel serial number
  // ourselves via XLSX.SSF.parse_date_code(). cellDates:true converts serials
  // to JS Date objects internally, and that conversion is timezone-sensitive  -
  // on this workbook it lands a few seconds before local midnight (e.g.
  // "Jun 1" becomes "May 31 23:59:50" in IST), so .getMonth()/.getFullYear()
  // silently read the wrong month for anyone east of UTC. parse_date_code()
  // reads {y, m, d} straight off the serial with no Date object and no TZ
  // conversion at all, so it's correct in every timezone.
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames.includes('Daily Dispatch Report') ? 'Daily Dispatch Report' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: true });
  const headers = rows[0];

  const monthIdx = headers.indexOf('Month');
  const tatVerdictIdx = headers.indexOf('TAT (Hit/Delay)');
  const transporterIdx = headers.indexOf('Transporter name');
  const channelIdx = headers.indexOf('Channel name');

  if (monthIdx === -1 || tatVerdictIdx === -1) {
    throw new Error('Could not find "Month" / "TAT (Hit/Delay)" columns in sheet "' + sheetName + '".');
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // parse_date_code's .m is 1-indexed
  const currentYear = now.getFullYear();

  let withinTAT = 0, breachTAT = 0, totalRowsThisMonth = 0;
  const byTransporter = {};
  const byChannel = {};

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawVal = r ? r[monthIdx] : null;
    if (rawVal == null) continue;

    // Accept either a raw Excel serial number (expected, raw:true) or a string/
    // Date fallback so the parser doesn't break if a future export changes format.
    let rowYear, rowMonth;
    if (typeof rawVal === 'number') {
      const parsedDate = XLSX.SSF.parse_date_code(rawVal);
      if (!parsedDate) continue;
      rowYear = parsedDate.y;
      rowMonth = parsedDate.m; // 1-indexed
    } else {
      const fallbackDate = rawVal instanceof Date ? rawVal : new Date(rawVal);
      if (isNaN(fallbackDate.getTime())) continue;
      rowYear = fallbackDate.getFullYear();
      rowMonth = fallbackDate.getMonth() + 1;
    }
    if (rowMonth !== currentMonth || rowYear !== currentYear) continue;

    totalRowsThisMonth++;
    const verdict = (r[tatVerdictIdx] || '').toString().trim();
    if (verdict === 'Within TAT' || verdict === 'TAT breach') {
      const transporter = transporterIdx > -1 ? (r[transporterIdx] || 'Unknown') : 'Unknown';
      const channel = channelIdx > -1 ? (r[channelIdx] || 'Unknown') : 'Unknown';

      byTransporter[transporter] = byTransporter[transporter] || { within: 0, breach: 0 };
      byChannel[channel] = byChannel[channel] || { within: 0, breach: 0 };

      if (verdict === 'Within TAT') {
        withinTAT++;
        byTransporter[transporter].within++;
        byChannel[channel].within++;
      } else {
        breachTAT++;
        byTransporter[transporter].breach++;
        byChannel[channel].breach++;
      }
    }
  }

  const judgedTotal = withinTAT + breachTAT;
  const pct = judgedTotal ? (withinTAT / judgedTotal * 100) : 0;

  return {
    pct, withinTAT, breachTAT, judgedTotal, totalRowsThisMonth,
    byTransporter, byChannel,
    monthName: now.toLocaleString('en-US', { month: 'long' }),
  };
}

/* ---------- PARSE ATP EXCEL (June sheet) ----------
 *
 * Source: "June" sheet, header row = row index 1 (row 2 in Excel).
 * Row index 0 = SUBTOTAL summary row  - skipped.
 * Data starts at row index 2.
 *
 * Column layout (0-indexed):
 *   12 = WK1 Plan   13 = WK1 Dispatch
 *   16 = WK2 Plan   17 = WK2 Dispatch
 *   21 = WK3 Plan   22 = WK3 Dispatch
 *   26 = WK4 Plan   27 = WK4 Dispatch
 *
 * Current week  = last week whose total dispatch > 0
 * WTD ATP       = current week dispatch ÷ current week plan
 * MTD ATP       = Σ dispatch (wk1..currentWk) ÷ Σ plan (wk1..currentWk)
 *
 * Ambiguous cases treated as 0:
 *   0/0, null/0, 0/null, null/null → 0
 *
 * NOTE: "June" sheet date columns are not used for month-filtering here  -
 * the file itself represents one month's plan. The month label is derived
 * from the filename or upload date instead.
 */
function parseATPWorkbook(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false });

  // Find the main monthly sheet — could be named June, July etc.
  // Prefer any calendar month name; fall back to first sheet.
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
  const sheetName = wb.SheetNames.find(n => MONTH_NAMES.includes(n.trim())) || wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: true });
  if (rows.length < 2) throw new Error('ATP sheet has no data rows.');

  // Auto-detect header row: if row 0 has WK column names, headers are in row 0.
  // If row 0 is a subtotals row (old format), headers are in row 1.
  const row0 = rows[0] || [];
  const headerRowIdx = row0.some(h => typeof h === 'string' && /WK\d\s+(Plan|Disp)/.test(h)) ? 0 : 1;
  const dataStartIdx = headerRowIdx + 1;
  const headers = rows[headerRowIdx];

  if (!headers) throw new Error('Could not find header row in ATP sheet.');

  // Accept both 'WK1 Dispatch' (old June format) and 'WK1 Disp' (new format)
  function findWkCols(wk) {
    const planIdx = headers.indexOf(`WK${wk} Plan`);
    let dispIdx = headers.indexOf(`WK${wk} Dispatch`);
    if (dispIdx === -1) dispIdx = headers.indexOf(`WK${wk} Disp`);
    return { plan: planIdx, disp: dispIdx };
  }

  // Only include weeks where plan column exists
  const WK_COLS = [1, 2, 3, 4].map(wk => ({ ...findWkCols(wk), wk }))
    .filter(({ plan }) => plan >= 0);

  if (!WK_COLS.length) throw new Error(
    `ATP sheet missing WK columns. Headers found: ${headers.filter(Boolean).slice(0,15).join(', ')}`
  );

  function n(v) {
    if (v === null || v === undefined || v === '') return 0;
    const num = parseFloat(v);
    return isNaN(num) ? 0 : num;
  }

  const wkTotals = WK_COLS.map(() => ({ plan: 0, disp: 0 }));

  for (let i = dataStartIdx; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === undefined)) continue;
    WK_COLS.forEach(({ plan, disp }, idx) => {
      wkTotals[idx].plan += n(plan >= 0 ? r[plan] : 0);
      wkTotals[idx].disp += n(disp >= 0 ? r[disp] : 0);
    });
  }

  let currentWkIdx = -1;
  for (let i = 0; i < wkTotals.length; i++) {
    if (wkTotals[i].disp > 0) currentWkIdx = i;
  }
  if (currentWkIdx === -1) throw new Error('No dispatch data found in any week column.');

  function safePct(num, den) {
    if (!den || !num) return 0;
    return (num / den) * 100;
  }

  const wtdPlan = wkTotals[currentWkIdx].plan;
  const wtdDisp = wkTotals[currentWkIdx].disp;
  const wtdPct  = safePct(wtdDisp, wtdPlan);

  const mtdPlan = wkTotals.slice(0, currentWkIdx + 1).reduce((s, w) => s + w.plan, 0);
  const mtdDisp = wkTotals.slice(0, currentWkIdx + 1).reduce((s, w) => s + w.disp, 0);
  const mtdPct  = safePct(mtdDisp, mtdPlan);

  const weeks = wkTotals.map((w, i) => ({
    label: `WK${WK_COLS[i] ? WK_COLS[i].wk : i + 1}`,
    plan: w.plan,
    disp: w.disp,
    pct: safePct(w.disp, w.plan),
    isCurrent: i === currentWkIdx,
    hasData: w.disp > 0 || w.plan > 0,
  }));

  return {
    wtdPct, wtdPlan, wtdDisp,
    mtdPct, mtdPlan, mtdDisp,
    currentWk: `WK${currentWkIdx + 1}`,
    weeks,
    sheetName,
  };
}

/* ---------- PARSE R2R WORKBOOK ----------
 *
 * Reads each monthly sheet (April, May, June … any sheet whose name matches
 * a calendar month in English). Per sheet:
 *   Col "FWD AWB Status"  → filter for "RTO Delivered"       → denominator
 *   Col "Final Status"    → of those, filter for "Closed"    → numerator
 *   R2R % = numerator / denominator × 100
 *
 * Column positions are looked up by name per sheet (they differ between months).
 * YTD = Σ closed across all months / Σ RTO Delivered across all months.
 *
 * Null / blank / non-matching cells are treated as 0 (excluded from both counts).
 */
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function parseR2RWorkbook(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false });

  // Collect only sheets whose name is a calendar month (case-insensitive)
  const monthSheets = wb.SheetNames.filter(n =>
    MONTH_NAMES.some(m => m.toLowerCase() === n.trim().toLowerCase())
  );
  if (!monthSheets.length) throw new Error('No monthly sheets found (expected sheet names like "April", "May" etc.).');

  let ytdRTO = 0, ytdClosed = 0;
  const months = [];

  for (const sheetName of monthSheets) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: true, defval: null });
    if (rows.length < 2) continue;

    const header = rows[0];
    const fwdIdx   = header.findIndex(h => typeof h === 'string' && h.trim() === 'FWD AWB Status');
    const finalIdx = header.findIndex(h => typeof h === 'string' && h.trim() === 'Final Status');

    if (fwdIdx === -1 || finalIdx === -1) {
      // Sheet exists but doesn't have the right columns  - skip gracefully
      months.push({ month: sheetName, rtoDelivered: 0, rtoClosed: 0, pct: 0, skipped: true });
      continue;
    }

    let rtoDelivered = 0, rtoClosed = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r[0] === null || r[0] === undefined) continue;
      const fwd   = (r[fwdIdx]   != null ? String(r[fwdIdx]).trim()   : '');
      const final = (r[finalIdx] != null ? String(r[finalIdx]).trim() : '');
      if (fwd === 'RTO Delivered') {
        rtoDelivered++;
        if (final === 'Closed') rtoClosed++;
      }
    }

    const pct = rtoDelivered ? (rtoClosed / rtoDelivered * 100) : 0;
    months.push({ month: sheetName, rtoDelivered, rtoClosed, pct, skipped: false });
    ytdRTO    += rtoDelivered;
    ytdClosed += rtoClosed;
  }

  const ytdPct = ytdRTO ? (ytdClosed / ytdRTO * 100) : 0;

  return { months, ytdRTO, ytdClosed, ytdPct };
}

/* ============================================================
   OTD D2C % + REV. LOGISTICS D2C %
   Both derived from the same "Dispatch Data" export, so one
   upload/parse populates both metrics at once.
   ============================================================ */
/* ---------- PARSE D2C DISPATCH WORKBOOK ----------
 *
 * Source: single flat sheet, one row per order line. No date filtering  -
 * whatever rows are in the uploaded file are used as-is (the PM exports
 * just the relevant period each time, so the file itself IS the period).
 *
 * OTD D2C %:
 *   1. Filter rows where Final = "DELIVERED" (exact, case-sensitive per
 *      the source filter convention) → this is the denominator.
 *   2. For those rows, TAT (hours) = ("last update" − "picked on") × 24.
 *   3. Numerator = rows where 0 < TAT < 144 (0–6 days).
 *   4. OTD D2C % = numerator ÷ denominator × 100.
 *
 * Rev. Logistics D2C %:
 *   Numerator = rows where Final is "RETURN", "Return", or "REQ RTO"
 *               (case variants both appear in the raw data).
 *   Denominator = total rows in the file (all order lines).
 *   Rev. Logistics D2C % = numerator ÷ denominator × 100.
 *
 * Both metrics come from the same "Final" column, so we scan the sheet
 * once and compute both in the same pass.
 *
 * LSP-LEVEL BREAKDOWN (added per PM request):
 *   Same two formulas, grouped by "Shipping Courier" instead of computed
 *   overall. Courier names are normalized before grouping because the raw
 *   column mixes case variants and regional sub-labels for what is really
 *   the same carrier  - confirmed with PM directly rather than guessed:
 *     - "Delhivery" / "DELHIVERY"                → merged to "Delhivery"
 *     - "Shadowfax" / "SHADOWFAX_DK"              → merged to "Shadowfax"
 *     - "Bluedart" / "BLUEDART_KOLKATA" / etc.     → merged to "Bluedart"
 *       (all regional Bluedart variants collapsed into one row, per PM)
 *     - "SELF"                                     → normalized to "Self"
 *     - anything else                              → kept as-is (so a
 *       genuinely new/unexpected courier label surfaces visibly rather
 *       than silently vanishing into a wrong bucket)
 *   Rows with a blank Shipping Courier are excluded from the LSP breakdown
 *   entirely (they can't be attributed to a carrier) but still count in
 *   the overall totals above.
 */
const D2C_RETURN_STATUSES = ['RETURN', 'Return', 'REQ RTO'];

function normalizeLSP(rawVal) {
  if (rawVal == null) return null;
  const v = String(rawVal).trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (upper.startsWith('BLUEDART')) return 'Bluedart';
  if (upper === 'DELHIVERY') return 'Delhivery';
  if (upper.startsWith('SHADOWFAX')) return 'Shadowfax';
  if (upper === 'SELF') return 'Self';
  return v; // unrecognized label  - keep as-is, surfaced rather than hidden
}

function parseD2CWorkbook(arrayBuffer) {
  // cellDates:false here  - "picked on" / "last update" are full timestamp
  // strings (e.g. "2026-06-04 17:17:08"), not Excel date-serial cells, so we
  // parse them with JS Date directly rather than relying on SheetJS's date
  // coercion (which is built for date-only cells, not full datetime strings
  // in this export format).
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false });
  // Accept any sheet name — look for one with a 'Final' column, fallback to first sheet
  let sheetName = wb.SheetNames[0];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const firstRow = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: true })[0] || [];
    if (firstRow.some(h => typeof h === 'string' && h.trim() === 'Final')) {
      sheetName = name;
      break;
    }
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: true, defval: null });

  const header = rows[0];
  if (!header) throw new Error('Could not read header row from this sheet.');
  const finalIdx      = header.findIndex(h => typeof h === 'string' && h.trim() === 'Final');
  const pickedIdx     = header.findIndex(h => typeof h === 'string' && h.trim().toLowerCase() === 'picked on');
  const lastUpdateIdx = header.findIndex(h => typeof h === 'string' && h.trim().toLowerCase() === 'last update');
  const courierIdx    = header.findIndex(h => typeof h === 'string' && h.trim() === 'Shipping Courier');

  if (finalIdx === -1) throw new Error('Could not find a "Final" column in this sheet.');
  if (pickedIdx === -1 || lastUpdateIdx === -1) {
    throw new Error('Could not find "picked on" / "last update" columns needed for OTD D2C.');
  }
  // courierIdx === -1 is non-fatal  - LSP breakdown just won't be available, overall metrics still work

  let totalRows = 0;
  let deliveredCount = 0, otdWithinWindow = 0;
  let returnCount = 0;
  const finalBreakdown = {};
  const byLSP = {}; // { "Delhivery": { total, delivered, otdWithin, returns }, ... }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === undefined || c === '')) continue;
    totalRows++;

    const finalVal = r[finalIdx] != null ? String(r[finalIdx]).trim() : '';
    if (finalVal) finalBreakdown[finalVal] = (finalBreakdown[finalVal] || 0) + 1;

    const lsp = courierIdx > -1 ? normalizeLSP(r[courierIdx]) : null;
    if (lsp) {
      byLSP[lsp] = byLSP[lsp] || { total: 0, delivered: 0, otdWithin: 0, returns: 0 };
      byLSP[lsp].total++;
    }

    let isOnTimeDelivery = false;
    if (finalVal === 'DELIVERED') {
      deliveredCount++;
      if (lsp) byLSP[lsp].delivered++;
      const picked = parseExcelDateTime(r[pickedIdx]);
      const updated = parseExcelDateTime(r[lastUpdateIdx]);
      if (picked && updated) {
        const tatHours = (updated - picked) / (1000 * 60 * 60);
        if (tatHours > 0 && tatHours < 144) {
          otdWithinWindow++;
          isOnTimeDelivery = true;
          if (lsp) byLSP[lsp].otdWithin++;
        }
      }
    }

    if (D2C_RETURN_STATUSES.includes(finalVal)) {
      returnCount++;
      if (lsp) byLSP[lsp].returns++;
    }
  }

  const otdPct = deliveredCount ? (otdWithinWindow / deliveredCount * 100) : 0;
  const revLogPct = totalRows ? (returnCount / totalRows * 100) : 0;

  // Derive %s per LSP from the raw counts above
  const lspSummary = Object.entries(byLSP).map(([name, v]) => ({
    name,
    total: v.total,
    delivered: v.delivered,
    otdWithin: v.otdWithin,
    otdPct: v.delivered ? (v.otdWithin / v.delivered * 100) : 0,
    returns: v.returns,
    revLogPct: v.total ? (v.returns / v.total * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  return {
    totalRows,
    deliveredCount, otdWithinWindow, otdPct,
    returnCount, revLogPct,
    finalBreakdown,
    lspSummary,
  };
}

// Parses datetime values from this export. Cells may arrive as JS strings
// (e.g. "2026-06-04 17:17:08") or, less commonly, as Excel serial numbers if
// the column was formatted as a date in the source sheet. Handles both.
function parseExcelDateTime(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    // Excel serial date → JS Date (days since 1899-12-30, includes time fraction)
    const ms = Math.round((val - 25569) * 86400 * 1000);
    return new Date(ms);
  }
  const d = new Date(String(val).trim());
  return isNaN(d.getTime()) ? null : d;
}

/* ============================================================
   OTD PRIMARY LOGISTICS %
   Source: "Daily Dispatch Report" sheet of the Primary Logistics
   Control Tower workbook (CMU → warehouse movements).
   ============================================================ */

/* ---------- PARSE OTD PRIMARY LOGISTICS WORKBOOK ----------
 *
 * Definition (locked against the workbook's own "Dashboard MIS" sheet,
 * which reports "On time %" = 79.92% for this file  - confirmed exact match):
 *
 *   OTD Primary Logistics % =
 *     COUNT(Shipment status = "On time delivery" OR "Before delivery")
 *     ÷ COUNT(Shipment status is NOT blank AND NOT "In transit")
 *     × 100
 *
 * This intentionally reads the "Shipment status" column directly rather
 * than the separate "TAT breach status" column  - the two are usually
 * aligned but can drift apart by a couple of rows (seen in this exact file:
 * 585 "on time/before" vs 583 "Within TAT"  - a 2-row gap), and the MIS
 * sheet's own published number matches the Shipment status version, so
 * that's the one this dashboard mirrors.
 *
 * BLANK-HANDLING (this sheet is clean today but won't always be, per PM):
 *   - A row with a blank/null/whitespace-only "Shipment status" is excluded
 *     from BOTH numerator and denominator  - it's neither a confirmed on-time
 *     delivery nor a confirmed in-transit shipment, so counting it either
 *     way would silently distort the %. We only count rows with an actual,
 *     recognized status.
 *   - String values are trimmed and compared case-sensitively against the
 *     known status set; anything that doesn't match a known status (e.g. a
 *     typo, a stray label) falls into an "Other/Unrecognized" bucket that's
 *     reported separately rather than silently dropped or silently counted
 *     as a breach  - this surfaces data-quality issues instead of hiding them.
 */
const OTD_PRIMARY_ON_TIME_STATUSES = ['On time delivery', 'Before delivery'];
const OTD_PRIMARY_EXCLUDED_STATUSES = ['In transit'];

// Normalise the raw "Transport Mode" cell value into one of three display buckets.
function normalizeTransportMode(raw) {
  if (!raw) return 'Others';
  const v = String(raw).trim().toUpperCase();
  if (v === 'FTL' || v.startsWith('FTL')) return 'FTL';
  if (v === 'PTL' || v.startsWith('PTL') || v === 'LTL') return 'PTL';
  return 'Others';
}

function parseOTDPrimaryWorkbook(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.includes('Daily Dispatch Report') ? 'Daily Dispatch Report' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: null });

  const header = rows[0];
  const statusIdx = header.findIndex(h => typeof h === 'string' && h.trim() === 'Shipment status');
  const transporterIdx = header.findIndex(h => typeof h === 'string' && h.trim() === 'Transporter');
  const modeIdx = header.findIndex(h => typeof h === 'string' && h.trim().toLowerCase() === 'transport mode');

  if (statusIdx === -1) {
    throw new Error('Could not find a "Shipment status" column in this sheet.');
  }

  let totalRowsSeen = 0;
  let blankStatusCount = 0;
  let excludedCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let unrecognizedCount = 0;
  const unrecognizedValues = {};
  const byTransporter = {};
  const byMode = {};
  const byTransporterMode = {}; // { mode: { transporter: { onTime, late } } }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === null || c === undefined || c === '')) continue; // fully empty row → skip entirely, don't count
    totalRowsSeen++;

    const rawStatus = r[statusIdx];
    const status = (rawStatus == null) ? '' : String(rawStatus).trim();

    if (status === '') {
      blankStatusCount++;
      continue; // excluded from both numerator and denominator, per blank-handling rule above
    }

    if (OTD_PRIMARY_EXCLUDED_STATUSES.includes(status)) {
      excludedCount++;
      continue; // "In transit"  - not yet judged, excluded from both numerator and denominator
    }

    const transporter = transporterIdx > -1 && r[transporterIdx] != null ? String(r[transporterIdx]).trim() : 'Unknown';
    const rawMode = modeIdx > -1 && r[modeIdx] != null ? r[modeIdx] : null;
    const mode = normalizeTransportMode(rawMode);
    byTransporter[transporter] = byTransporter[transporter] || { onTime: 0, late: 0 };
    byMode[mode] = byMode[mode] || { onTime: 0, late: 0 };
    byTransporterMode[mode] = byTransporterMode[mode] || {};
    byTransporterMode[mode][transporter] = byTransporterMode[mode][transporter] || { onTime: 0, late: 0 };

    if (OTD_PRIMARY_ON_TIME_STATUSES.includes(status)) {
      onTimeCount++;
      byTransporter[transporter].onTime++;
      byMode[mode].onTime++;
      byTransporterMode[mode][transporter].onTime++;
    } else if (status === 'Delay') {
      lateCount++;
      byTransporter[transporter].late++;
      byMode[mode].late++;
      byTransporterMode[mode][transporter].late++;
    } else {
      unrecognizedCount++;
      unrecognizedValues[status] = (unrecognizedValues[status] || 0) + 1;
      byTransporter[transporter].late++;
      byMode[mode].late++;
      byTransporterMode[mode][transporter].late++;
    }
  }

  const judgedTotal = onTimeCount + lateCount + unrecognizedCount;
  const pct = judgedTotal ? (onTimeCount / judgedTotal * 100) : 0;

  return {
    pct, onTimeCount, lateCount, unrecognizedCount, judgedTotal,
    totalRowsSeen, blankStatusCount, excludedCount,
    unrecognizedValues, byTransporter, byMode, byTransporterMode,
  };
}

/* ---------- PARSE INVENTORY (SAI & DOH) WORKBOOK ----------
 *   Expects "Base_Data (SAI & DOH).xlsx". Group header on row 1, sub-header
 *   on row 2 (both 0-indexed as row 0/1), data starts row 3 (0-indexed row 2).
 *   Column layout (0-indexed):
 *     0-2   = Category, Sub-Category, SKU
 *     3-6   = Stock            (E, N, S, W)
 *     8-11  = Projection July  (E, N, S, W)
 *     13-16 = Transit Stock    (E, N, S, W)
 *     18-21 = SAI (SOH only)   (E, N, S, W)
 *     23-26 = SAI (Stock+Transit)  cols X, Y, Z, AA
 *     28-31 = DOH (SOH)
 *     33-36 = DOH (Stock+Transit)
 */
function parseInventoryWorkbook(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellFormula: false, cellText: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const rows = [];
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[2]) continue; // skip blank SKU rows

    const toNum = v => (v === null || v === undefined || v === 'No Proj' || v === 'No proj' || v === '' || isNaN(+v)) ? null : +v;

    rows.push({
      category: r[0] || '',
      subcat:   r[1] || '',
      sku:      r[2] || '',
      stock:    { E: toNum(r[3]),  N: toNum(r[4]),  S: toNum(r[5]),  W: toNum(r[6]) },
      proj:     { E: toNum(r[8]),  N: toNum(r[9]),  S: toNum(r[10]), W: toNum(r[11]) },
      transit:  { E: toNum(r[13]), N: toNum(r[14]), S: toNum(r[15]), W: toNum(r[16]) },
      sai_soh:  { E: toNum(r[18]), N: toNum(r[19]), S: toNum(r[20]), W: toNum(r[21]) },
      sai_st:   { E: toNum(r[23]), N: toNum(r[24]), S: toNum(r[25]), W: toNum(r[26]) },
      doh_soh:  { E: toNum(r[28]), N: toNum(r[29]), S: toNum(r[30]), W: toNum(r[31]) },
      doh_st:   { E: toNum(r[33]), N: toNum(r[34]), S: toNum(r[35]), W: toNum(r[36]) },
    });
  }
  if (!rows.length) throw new Error('No data rows found. Check the file format.');
  return rows;
}
