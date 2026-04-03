/* ═══════════════════════════════════════════════════════════
   MEMORY APP · RồngLeo
   app.js v2 — reuse contacts table, AI search with people
═══════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   CONFIG
   CONTACTS_APP_ID: id_app của contacts app gốc
   Để trống nếu contacts và memories dùng chung id_app
───────────────────────────────────────── */
const CONFIG = {
  SUPABASE_URL:      "",
  SUPABASE_ANON_KEY: "",
  USER_ID:           "RongLeo",
  APP_ID:            "memory_app_v1",
  CONTACTS_APP_ID:   "",          // ← id_app của contacts app (để trống = dùng APP_ID)
  TABLE_MEMORIES:    "memories",
  TABLE_CONTACTS:    "contacts",
  GROQ_API_KEY:      "",
  ENABLE_AI:         true,
};

const LS_KEY            = "memory_app_config";
const LS_LOCAL_MEMORIES = "memory_app_local_memories";
const LS_LOCAL_CONTACTS = "memory_app_local_contacts";

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let supabase           = null;
let memories           = [];
let contacts           = [];         // read-only từ contacts app
let filteredMemories   = [];
let activeFilter       = "all";
let activePersonFilter = null;       // contact id đang lọc
let currentModalMemory = null;
let editingMemoryId    = null;
let personSearch       = "";

// Expose data arrays on window — accessible by any inline script
Object.defineProperty(window, "memories", { get: () => memories, configurable: true });
Object.defineProperty(window, "contacts", { get: () => contacts, configurable: true });

const formState = { tags: [], emotions: [], people: [] };

/* ─────────────────────────────────────────
   EMOTIONS
───────────────────────────────────────── */
const EMOTION_LIST = [
  "Vui", "Hạnh phúc", "Buồn", "Nhớ nhung", "Tự hào",
  "Biết ơn", "Hối tiếc", "Xúc động", "Lo lắng", "Bình yên",
  "Cô đơn", "Phấn khích", "Bất ngờ", "Tức giận", "Sợ hãi",
];

/* Fix: trả null nếu không cấu hình CONTACTS_APP_ID
   → loadContacts sẽ query KHÔNG filter id_app
   → tránh fallback sai về APP_ID của memory app */
function contactsAppId() {
  return CONFIG.CONTACTS_APP_ID || null;
}

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
window.addEventListener("DOMContentLoaded", () => {
  loadConfigFromLS();
  initSupabase();
  loadSettingsToUI();
  applyThemeFromLS();
  buildEmotionGrid();
  setupTagInput();
  setupPersonPicker();
  setupSearch();
  loadAll();

  // Safe DOM listeners — run after DOM is ready
  document.getElementById("btnTheme").addEventListener("click", () => {
    const cfg = document.getElementById("cfgDarkMode");
    if (cfg) { cfg.checked = !cfg.checked; toggleTheme(); }
  });

  document.getElementById("btnRecall").addEventListener("click", () => {
    if (!memories.length) { showToast("Chưa có ký ức nào!"); return; }
    const m = memories[Math.floor(Math.random() * memories.length)];
    renderRandomCard(m);
  });

  setupAISuggest();

  // Show home screen on first load
  navigate("home", document.querySelector('.nav-btn[data-screen="home"]'));
});

function loadConfigFromLS() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) Object.assign(CONFIG, JSON.parse(saved));
  } catch (_) {}
}

function initSupabase() {
  supabase = null;
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return;
  try {
    supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  } catch (_) {}
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════════ */
function navigate(screenId, btn) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + screenId).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  if (screenId === "list")     { renderMemoriesList(); buildFilterRow(); }
  if (screenId === "home")     { updateStats(); }
  if (screenId === "contacts") { renderContactsGrid(); }
  if (screenId === "add" && !editingMemoryId) { resetAddForm(); }
}

function switchListTab(tab, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tab-memories").style.display = tab === "memories" ? "" : "none";
  document.getElementById("tab-contacts").style.display = tab === "contacts" ? "" : "none";
  if (tab === "contacts") renderLinkedContacts();
}

/* ═══════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════ */
function applyThemeFromLS() {
  const dark = localStorage.getItem("memory_dark_mode") !== "false";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const el = document.getElementById("cfgDarkMode");
  if (el) el.checked = dark;
  document.getElementById("btnTheme").textContent = dark ? "🌙" : "☀️";
}

function toggleTheme() {
  const isDark = document.getElementById("cfgDarkMode").checked;
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  localStorage.setItem("memory_dark_mode", isDark);
  document.getElementById("btnTheme").textContent = isDark ? "🌙" : "☀️";
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════════════════════ */
function loadSettingsToUI() {
  document.getElementById("cfgSupabaseUrl").value   = CONFIG.SUPABASE_URL || "";
  document.getElementById("cfgSupabaseKey").value   = CONFIG.SUPABASE_ANON_KEY || "";
  document.getElementById("cfgGroqKey").value       = CONFIG.GROQ_API_KEY || "";
  document.getElementById("cfgEnableAI").checked    = CONFIG.ENABLE_AI !== false;
  document.getElementById("cfgUserId").value        = CONFIG.USER_ID || "RongLeo";
  document.getElementById("cfgAppId").value         = CONFIG.APP_ID || "memory_app_v1";
  document.getElementById("cfgContactsAppId").value = CONFIG.CONTACTS_APP_ID || "";
}

function saveSettings() {
  CONFIG.SUPABASE_URL      = document.getElementById("cfgSupabaseUrl").value.trim();
  CONFIG.SUPABASE_ANON_KEY = document.getElementById("cfgSupabaseKey").value.trim();
  CONFIG.GROQ_API_KEY      = document.getElementById("cfgGroqKey").value.trim();
  CONFIG.ENABLE_AI         = document.getElementById("cfgEnableAI").checked;
  CONFIG.USER_ID           = document.getElementById("cfgUserId").value.trim() || "RongLeo";
  CONFIG.APP_ID            = document.getElementById("cfgAppId").value.trim() || "memory_app_v1";
  CONFIG.CONTACTS_APP_ID   = document.getElementById("cfgContactsAppId").value.trim();
  localStorage.setItem(LS_KEY, JSON.stringify(CONFIG));
  initSupabase();
  loadAll();
  showToast("✅ Đã lưu cài đặt");
}

/* ═══════════════════════════════════════════════════════════
   DATA LOADING
═══════════════════════════════════════════════════════════ */
async function loadAll() {
  await Promise.all([loadMemories(), loadContacts()]);
  // Data integrity: strip ghost contact ids sau khi cả hai đã load
  memories = memories.map(sanitiseMemoryPeopleIds);
  updateStats();
  buildFilterRow();
  renderPersonPicker();
}

async function loadMemories() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(CONFIG.TABLE_MEMORIES).select("*")
        .eq("id_user", CONFIG.USER_ID).eq("id_app", CONFIG.APP_ID)
        .order("created_at", { ascending: false });
      if (!error && data) { memories = data; saveLocalFallback(LS_LOCAL_MEMORIES, memories); return; }
    } catch (_) {}
  }
  memories = loadLocalFallback(LS_LOCAL_MEMORIES);
}

/* Contacts: read-only.
   - CONTACTS_APP_ID set   → filter id_user + id_app
   - CONTACTS_APP_ID unset → filter id_user only (tất cả app của user) */
async function loadContacts() {
  if (supabase) {
    try {
      let q = supabase
        .from(CONFIG.TABLE_CONTACTS)
        .select("id, name, org, phones, emails")
        .eq("id_user", CONFIG.USER_ID);
      const cAppId = contactsAppId();
      if (cAppId) q = q.eq("id_app", cAppId);
      q = q.order("name");
      const { data, error } = await q;
      if (!error && data) { contacts = data; saveLocalFallback(LS_LOCAL_CONTACTS, contacts); return; }
    } catch (_) {}
  }
  contacts = loadLocalFallback(LS_LOCAL_CONTACTS);
}

/* Resolve contact ids → objects, filter ghost ids (contact đã xoá) */
function resolveContacts(ids) {
  if (!ids || !ids.length) return [];
  const validSet = new Set(contacts.map(c => c.id));
  return ids.filter(id => validSet.has(id)).map(id => contacts.find(c => c.id === id));
}

/* sanitiseMemory: strip related_people_ids không còn tồn tại trong contacts */
function sanitiseMemoryPeopleIds(m) {
  if (!m.related_people_ids || !m.related_people_ids.length) return m;
  const validSet = new Set(contacts.map(c => c.id));
  const clean = m.related_people_ids.filter(id => validSet.has(id));
  if (clean.length === m.related_people_ids.length) return m;
  return { ...m, related_people_ids: clean };
}

/* ─── local fallback ─── */
function saveLocalFallback(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
}
function loadLocalFallback(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) { return []; }
}

/* ═══════════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════════ */
function updateStats() {
  document.getElementById("stat-total").textContent  = memories.length;
  document.getElementById("stat-people").textContent = contacts.length;
  const allTags = new Set(memories.flatMap(m => m.tags || []));
  document.getElementById("stat-tags").textContent   = allTags.size;
}

/* ═══════════════════════════════════════════════════════════
   RANDOM RECALL
═══════════════════════════════════════════════════════════ */
function renderRandomCard(m) {
  const el       = document.getElementById("random-display");
  const dateStr  = formatDate(m);
  const tags     = (m.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");
  const emotions = (m.emotions || []).map(e => `<span class="tag emotion">${esc(e)}</span>`).join("");
  const people   = resolveContacts(m.related_people_ids)
    .map(c => `<span class="tag person" onclick="filterByPerson('${c.id}')" style="cursor:pointer" title="Xem ký ức của ${esc(c.name)}">👤 ${esc(c.name)}</span>`)
    .join("");
  const lesson   = m.lesson
    ? `<div class="rc-lesson"><span>💡 Bài học:</span> ${esc(m.lesson)}</div>` : "";

  el.innerHTML = `
    <div class="random-card" onclick="openMemoryModal('${m.id}')">
      <div class="rc-content">${esc(m.content)}</div>
      ${lesson}
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${tags}${emotions}${people}
        ${dateStr ? `<span class="memory-date">${dateStr}</span>` : ""}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   MEMORIES LIST + FILTER
═══════════════════════════════════════════════════════════ */
function buildFilterRow() {
  const allTags     = [...new Set(memories.flatMap(m => m.tags || []))].sort();
  const allEmotions = [...new Set(memories.flatMap(m => m.emotions || []))].sort();
  const linkedIds   = new Set(memories.flatMap(m => m.related_people_ids || []));
  const linkedPeople = contacts.filter(c => linkedIds.has(c.id));

  const row = document.getElementById("filterRow");
  row.innerHTML = `<button class="filter-chip ${activeFilter==="all"?"active":""}" onclick="applyFilter('all',this)">Tất cả</button>`;
  allTags.forEach(t =>
    row.innerHTML += `<button class="filter-chip ${activeFilter===t?"active":""}" onclick="applyFilter(${JSON.stringify(t)},this)">#${esc(t)}</button>`);
  allEmotions.forEach(e =>
    row.innerHTML += `<button class="filter-chip ${activeFilter===e?"active":""}" onclick="applyFilter(${JSON.stringify(e)},this)">${esc(e)}</button>`);
  linkedPeople.forEach(c =>
    row.innerHTML += `<button class="filter-chip ${activeFilter==="person:"+c.id?"active":""}" onclick="applyFilter('person:${c.id}',this)">👤 ${esc(c.name)}</button>`);
}

function applyFilter(filter, btn) {
  activeFilter       = filter;
  activePersonFilter = filter.startsWith("person:") ? filter.slice(7) : null;
  document.querySelectorAll(".filter-chip").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  document.getElementById("aiBanner").classList.remove("show");
  applyCurrentFilter();
}

function filterByPerson(contactId) {
  navigate("list", document.querySelector('.nav-btn[data-screen="list"]'));
  setTimeout(() => {
    activeFilter       = "person:" + contactId;
    activePersonFilter = contactId;
    buildFilterRow();
    applyCurrentFilter();
  }, 60);
}

function applyCurrentFilter() {
  const q = document.getElementById("searchInput").value.toLowerCase();
  filteredMemories = memories.filter(m => {
    let matchFilter = true;
    if (activeFilter !== "all") {
      if (activePersonFilter) {
        matchFilter = (m.related_people_ids || []).includes(activePersonFilter);
      } else {
        matchFilter = (m.tags || []).includes(activeFilter) || (m.emotions || []).includes(activeFilter);
      }
    }
    const matchQ = !q
      || m.content.toLowerCase().includes(q)
      || (m.tags || []).some(t => t.toLowerCase().includes(q))
      || (m.lesson || "").toLowerCase().includes(q)
      || resolveContacts(m.related_people_ids).some(c =>
          c.name.toLowerCase().includes(q) || (c.org || "").toLowerCase().includes(q));
    return matchFilter && matchQ;
  });
  renderMemoriesList();
}

function renderMemoriesList() {
  const list = document.getElementById("memoriesList");
  if (!memories.length) {
    list.innerHTML = `<p style="color:var(--muted);font-size:0.85rem;text-align:center;padding:24px 0">Chưa có ký ức nào. Tạo ký ức đầu tiên!</p>`;
    return;
  }
  const source = (filteredMemories.length > 0 || activeFilter !== "all" || document.getElementById("searchInput").value)
    ? filteredMemories : memories;
  if (!source.length) {
    list.innerHTML = `<p style="color:var(--muted);font-size:0.85rem;text-align:center;padding:24px 0">Không tìm thấy ký ức nào.</p>`;
    return;
  }
  list.innerHTML = source.map(m => {
    const snippet  = m.content.length > 120 ? m.content.slice(0,120) + "…" : m.content;
    const tags     = (m.tags || []).slice(0,2).map(t => `<span class="tag">${esc(t)}</span>`).join("");
    const emotions = (m.emotions || []).slice(0,1).map(e => `<span class="tag emotion">${esc(e)}</span>`).join("");
    const people   = resolveContacts(m.related_people_ids).slice(0,2)
      .map(c => `<span class="tag person">👤 ${esc(c.name)}</span>`).join("");
    const dateStr  = formatDate(m);
    return `<div class="memory-card" onclick="openMemoryModal('${m.id}')">
      <div class="content">${esc(snippet)}</div>
      <div class="meta">${tags}${emotions}${people}${dateStr ? `<span class="memory-date">${dateStr}</span>` : ""}</div>
    </div>`;
  }).join("");
}

function setupSearch() {
  const input = document.getElementById("searchInput");
  let t;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => applyCurrentFilter(), 300); });
  document.getElementById("btnAISearch").addEventListener("click", aiSearch);
}

/* ═══════════════════════════════════════════════════════════
   SCORING ENGINE
   keyword_match * 1 + tag_match * 2 + emotion_match * 2 + person_match * 5
═══════════════════════════════════════════════════════════ */
function scoreMemory(m, { keywords = [], tags = [], emotions = [], matchedContactIds = new Set() }) {
  let score = 0;
  const content = m.content.toLowerCase();

  // keyword match (×1 per keyword hit)
  keywords.forEach(k => { if (content.includes(k.toLowerCase())) score += 1; });

  // tag match (×2 per tag hit)
  const mTags = m.tags || [];
  tags.forEach(t => { if (mTags.includes(t)) score += 2; });

  // emotion match (×2 per emotion hit)
  const mEmotions = m.emotions || [];
  emotions.forEach(e => { if (mEmotions.includes(e)) score += 2; });

  // person match (×5 per matched contact — highest weight)
  const mPeople = m.related_people_ids || [];
  mPeople.forEach(id => { if (matchedContactIds.has(id)) score += 5; });

  return score;
}

/* ═══════════════════════════════════════════════════════════
   MATCH PEOPLE — exact first, then includes, max 3
═══════════════════════════════════════════════════════════ */
function matchContactsByName(names, orgs) {
  const matched = new Map(); // id → contact

  // Pass 1: exact match (case-insensitive)
  contacts.forEach(c => {
    const exactName = names.some(n => c.name.toLowerCase() === n.toLowerCase());
    const exactOrg  = orgs.some(o => c.org && c.org.toLowerCase() === o.toLowerCase());
    if (exactName || exactOrg) matched.set(c.id, c);
  });

  // Pass 2: includes match (only if room left)
  contacts.forEach(c => {
    if (matched.has(c.id)) return;
    const includesName = names.some(n => c.name.toLowerCase().includes(n.toLowerCase()));
    const includesOrg  = orgs.some(o => c.org && c.org.toLowerCase().includes(o.toLowerCase()));
    if (includesName || includesOrg) matched.set(c.id, c);
  });

  // max 3 contacts để tránh quá rộng
  const result = new Set([...matched.keys()].slice(0, 3));
  return result;
}
/* ═══════════════════════════════════════════════════════════
   AI SEARCH (with people + org)
═══════════════════════════════════════════════════════════ */
async function aiSearch() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) { showToast("Nhập từ khoá để tìm kiếm"); return; }
  if (!CONFIG.GROQ_API_KEY || !CONFIG.ENABLE_AI) { applyCurrentFilter(); return; }

  const btn    = document.getElementById("btnAISearch");
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span>';
  btn.disabled  = true;
  const banner  = document.getElementById("aiBanner");

  try {
    const res = await callGroq([{
      role: "user",
      content: `Phân tích query tìm kiếm ký ức và trả về JSON duy nhất (không markdown):
Query: "${q}"
Format: {"keywords":[],"tags":[],"emotions":[],"people":[],"orgs":[]}
- keywords: từ khoá nội dung (tối đa 3)
- tags: tag chủ đề tiếng Việt (tối đa 3)
- emotions: chọn từ: ${EMOTION_LIST.join(", ")} (tối đa 2)
- people: tên người được nhắc đến (tối đa 3)
- orgs: tên tổ chức / công ty (tối đa 2)`
    }]);

    const parsed = safeParseJSON(res);
    if (!parsed) throw new Error("parse fail");

    const { keywords = [], tags = [], emotions = [], people: pNames = [], orgs = [] } = parsed;

    // Step 1: match contacts — exact first, then includes, max 3
    let matchedContactIds = matchContactsByName(pNames, orgs);

    // Supplement from Supabase if contacts cache is partial
    if (supabase && (pNames.length || orgs.length)) {
      const orParts = [
        ...pNames.map(p => `name.ilike.%${p}%`),
        ...orgs.map(o => `org.ilike.%${o}%`),
      ].slice(0, 10); // cap to avoid Supabase OR limit
      if (orParts.length) {
        let cq = supabase.from(CONFIG.TABLE_CONTACTS).select("id")
          .eq("id_user", CONFIG.USER_ID);
        const cAppId = contactsAppId();
        if (cAppId) cq = cq.eq("id_app", cAppId);
        const { data: extra } = await cq.or(orParts.join(","));
        // merge but respect max-3 cap (exact matches already in set have priority)
        const extras = (extra || []).map(c => c.id).filter(id => !matchedContactIds.has(id));
        extras.slice(0, 3 - matchedContactIds.size).forEach(id => matchedContactIds.add(id));
      }
    }

    // Step 2: candidate pool — Supabase keyword search + full local scan
    let candidates = [...memories]; // start with all local

    if (supabase && keywords.length) {
      const orParts = keywords.map(k => `content.ilike.%${k}%`);
      const { data } = await supabase
        .from(CONFIG.TABLE_MEMORIES).select("*")
        .eq("id_user", CONFIG.USER_ID).eq("id_app", CONFIG.APP_ID)
        .or(orParts.join(","))
        .order("created_at", { ascending: false });
      // merge Supabase results into candidate pool (dedup by id)
      if (data && data.length) {
        const localIds = new Set(memories.map(m => m.id));
        const newFromDB = data.filter(m => !localIds.has(m.id));
        candidates = [...memories, ...newFromDB];
      }
    }

    // Step 3: score every candidate
    const scoreCtx = { keywords, tags, emotions, matchedContactIds };
    const scored = candidates
      .map(m => ({ m, score: scoreMemory(m, scoreCtx) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    const results = scored.map(({ m }) => m);

    filteredMemories = results;
    renderMemoriesList();

    const matchedNames = [...matchedContactIds]
      .map(id => contacts.find(c => c.id === id)?.name).filter(Boolean);
    const sumParts = [
      ...keywords, ...tags, ...emotions,
      ...(matchedNames.length ? matchedNames.map(n => `👤${n}`) : pNames.map(n => `👤${n}`)),
    ];
    banner.textContent = `✦ AI tìm thấy ${results.length} ký ức · ${sumParts.join(", ")}`;
    banner.classList.add("show");
  } catch (e) {
    showToast("Lỗi AI search: " + e.message);
    applyCurrentFilter();
  }

  btn.innerHTML = "✦ AI";
  btn.disabled  = false;
}

/* ═══════════════════════════════════════════════════════════
   CONTACTS SCREEN (read-only, click → detail)
═══════════════════════════════════════════════════════════ */
function renderContactsGrid() {
  const q = (document.getElementById("contactSearchInput") || {}).value || "";
  if (q) { filterContactsGrid(q); return; }

  const grid = document.getElementById("contactsGrid");
  if (!grid) return;
  if (!contacts.length) {
    grid.innerHTML = `<p style="color:var(--muted);font-size:0.85rem;grid-column:1/-1;text-align:center;padding:32px 0">
      Chưa tải được contacts.<br><span style="font-size:0.75rem">Kiểm tra CONTACTS_APP_ID trong Cài đặt.</span></p>`;
    return;
  }
  const memCount = {};
  memories.forEach(m => (m.related_people_ids || []).forEach(id => {
    memCount[id] = (memCount[id] || 0) + 1;
  }));
  grid.innerHTML = contacts.map(c => {
    const count = memCount[c.id] || 0;
    return `<div class="contact-card" onclick="openContactDetail('${c.id}')">
      <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="contact-card-name">${esc(c.name)}</div>
      ${c.org ? `<div class="contact-card-org">${esc(c.org)}</div>` : ""}
      <div class="contact-card-count">${count ? `${count} ký ức` : "—"}</div>
    </div>`;
  }).join("");
}

function openContactDetail(contactId) {
  const c = contacts.find(x => x.id === contactId);
  if (!c) return;
  const related = memories.filter(m => (m.related_people_ids || []).includes(contactId));

  // set avatar initial
  const avatarEl = document.getElementById("cdAvatar");
  if (avatarEl) avatarEl.textContent = c.name.charAt(0).toUpperCase();

  document.getElementById("cdName").textContent  = c.name;
  const orgEl = document.getElementById("cdOrg");
  orgEl.textContent   = c.org || "";
  orgEl.style.display = c.org ? "" : "none";
  document.getElementById("cdCount").textContent = `${related.length} ký ức liên quan`;

  const list = document.getElementById("cdMemories");
  list.innerHTML = related.length
    ? related.map(m => {
        const snippet = m.content.length > 100 ? m.content.slice(0, 100) + "…" : m.content;
        const dateStr = formatDate(m);
        const tags    = (m.tags || []).slice(0, 2).map(t => `<span class="tag">${esc(t)}</span>`).join("");
        return `<div class="memory-card" onclick="closeContactDetail();openMemoryModal('${m.id}')">
          <div class="content">${esc(snippet)}</div>
          <div class="meta">${tags}${dateStr ? `<span class="memory-date">${dateStr}</span>` : ""}</div>
        </div>`;
      }).join("")
    : `<p style="color:var(--muted);font-size:0.85rem;font-style:italic;padding:12px 0">Chưa có ký ức nào gắn với người này.</p>`;

  document.getElementById("contactDetailModal").classList.add("show");
}

function closeContactDetail(e) {
  if (!e || e.target === document.getElementById("contactDetailModal")) {
    document.getElementById("contactDetailModal").classList.remove("show");
  }
}

/* ═══════════════════════════════════════════════════════════
   PERSON PICKER (search-based multi select)
═══════════════════════════════════════════════════════════ */
function setupPersonPicker() {
  const input = document.getElementById("personSearchInput");
  input.addEventListener("input", () => {
    personSearch = input.value.toLowerCase();
    renderPersonPicker();
  });
  input.addEventListener("focus", () => {
    document.getElementById("personPickerDropdown").style.display = "";
  });
  document.addEventListener("click", e => {
    if (!e.target.closest("#personPickerWrap")) {
      document.getElementById("personPickerDropdown").style.display = "none";
    }
  });
}

function renderPersonPicker() {
  const wrap    = document.getElementById("personPickerSelected");
  const results = document.getElementById("personPickerResults");
  const selected = resolveContacts(formState.people);

  // selected chips
  wrap.innerHTML = selected.length
    ? selected.map(c =>
        `<span class="tag-item is-tag" onclick="togglePersonPick('${c.id}')">
          👤 ${esc(c.name)}<button class="remove-tag" type="button">×</button>
        </span>`).join("")
    : `<span style="font-size:0.78rem;color:var(--muted);padding:2px 4px">Chưa chọn ai</span>`;

  // dropdown list
  const filtered = contacts
    .filter(c => !formState.people.includes(c.id) &&
      (!personSearch || c.name.toLowerCase().includes(personSearch) ||
       (c.org || "").toLowerCase().includes(personSearch)))
    .slice(0, 25);

  if (!contacts.length) {
    results.innerHTML = `<div class="picker-empty">Chưa có contacts — kiểm tra Cài đặt</div>`;
  } else if (!filtered.length) {
    results.innerHTML = `<div class="picker-empty">Không tìm thấy</div>`;
  } else {
    results.innerHTML = filtered.map(c =>
      `<div class="picker-item" onclick="togglePersonPick('${c.id}')">
        <div class="picker-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="picker-info">
          <div class="picker-name">${esc(c.name)}</div>
          ${c.org ? `<div class="picker-org">${esc(c.org)}</div>` : ""}
        </div>
      </div>`).join("");
  }
}

function togglePersonPick(id) {
  if (formState.people.includes(id)) {
    formState.people = formState.people.filter(x => x !== id);
  } else {
    formState.people.push(id);
  }
  document.getElementById("personSearchInput").value = "";
  personSearch = "";
  renderPersonPicker();
}

/* ═══════════════════════════════════════════════════════════
   ADD / EDIT FORM
═══════════════════════════════════════════════════════════ */
function buildEmotionGrid() {
  const grid = document.getElementById("emotionGrid");
  grid.innerHTML = EMOTION_LIST.map(e =>
    `<button type="button" class="emotion-btn" data-emotion="${e}" onclick="toggleEmotion('${e}',this)">${e}</button>`
  ).join("");
}

function toggleEmotion(e, btn) {
  if (formState.emotions.includes(e)) {
    formState.emotions = formState.emotions.filter(x => x !== e);
    btn.classList.remove("selected");
  } else {
    formState.emotions.push(e);
    btn.classList.add("selected");
  }
}

function setupTagInput() {
  const input = document.getElementById("tagRawInput");
  input.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
      e.preventDefault();
      addTag(input.value.trim().replace(/,$/, ""));
      input.value = "";
    }
    if (e.key === "Backspace" && !input.value && formState.tags.length) {
      removeTag(formState.tags[formState.tags.length - 1]);
    }
  });
}

function addTag(t) {
  if (!t || formState.tags.includes(t)) return;
  formState.tags.push(t);
  renderTagWrap();
}

function removeTag(t) {
  formState.tags = formState.tags.filter(x => x !== t);
  renderTagWrap();
}

function renderTagWrap() {
  const wrap = document.getElementById("tagInputWrap");
  const input = document.getElementById("tagRawInput");
  wrap.innerHTML = "";
  formState.tags.forEach(t => {
    const span = document.createElement("span");
    span.className = "tag-item is-tag";
    span.innerHTML = `${esc(t)}<button class="remove-tag" onclick="removeTag('${esc(t)}')" type="button">×</button>`;
    wrap.appendChild(span);
  });
  wrap.appendChild(input);
}

function resetAddForm() {
  editingMemoryId = null;
  document.getElementById("memContent").value = "";
  document.getElementById("memYear").value    = "";
  document.getElementById("memDate").value    = "";
  document.getElementById("memLesson").value  = "";
  formState.tags = []; formState.emotions = []; formState.people = [];
  renderTagWrap(); buildEmotionGrid();
  personSearch = "";
  document.getElementById("personSearchInput").value = "";
  document.getElementById("personPickerDropdown").style.display = "none";
  renderPersonPicker();
  document.getElementById("aiSuggestBox").classList.remove("show");
  document.getElementById("addFormTitle").textContent  = "Tạo ký ức mới";
  document.getElementById("btnSaveMemory").textContent = "Lưu ký ức";
  document.getElementById("btnCancelEdit").style.display = "none";
}

function cancelEdit() {
  editingMemoryId = null;
  resetAddForm();
  navigate("home", document.querySelector('.nav-btn[data-screen="home"]'));
}

/* ─────────────────────────────────────────
   AI SUGGEST (with people suggestion)
───────────────────────────────────────── */
function setupAISuggest() {
  const btnEl = document.getElementById("btnAISuggest");
  if (!btnEl) return;
  btnEl.addEventListener("click", async () => {
  const content = document.getElementById("memContent").value.trim();
  if (!content) { showToast("Nhập nội dung ký ức trước"); return; }
  if (!CONFIG.GROQ_API_KEY || !CONFIG.ENABLE_AI) { showToast("Chưa cấu hình Groq"); return; }

  const btn = document.getElementById("btnAISuggest");
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Đang phân tích…';
  btn.disabled  = true;

  try {
    const cNames = contacts.slice(0, 50).map(c => c.name).join(", ");
    const res = await callGroq([{
      role: "user",
      content: `Phân tích ký ức sau và trả về JSON duy nhất (không markdown):
"${content}"

Contacts hiện có: ${cNames || "(chưa có)"}

Format:
{"tags":[],"emotions":[],"lesson":null,"people":[]}

- tags: 2-4 từ khoá ngắn tiếng Việt
- emotions: chọn từ: ${EMOTION_LIST.join(", ")}
- lesson: 1 câu ngắn hoặc null
- people: tên người được nhắc đến (chỉ nếu có trong contacts)`
    }]);

    const parsed = safeParseJSON(res);
    if (!parsed) throw new Error("parse fail");

    document.getElementById("aiSuggestBox").classList.add("show");
    renderSuggestChips("suggestTags", parsed.tags || [], t => addTag(t));
    renderSuggestChips("suggestEmotions", parsed.emotions || [], e => {
      if (!formState.emotions.includes(e)) {
        formState.emotions.push(e);
        document.querySelectorAll(".emotion-btn").forEach(b => {
          if (b.dataset.emotion === e) b.classList.add("selected");
        });
      }
    });

    const lessonWrap = document.getElementById("suggestLessonWrap");
    if (parsed.lesson) {
      lessonWrap.style.display = "";
      renderSuggestChips("suggestLesson", [parsed.lesson], l => {
        document.getElementById("memLesson").value = l;
      });
    } else {
      lessonWrap.style.display = "none";
    }

    // people suggestion — dùng matchContactsByName (exact first, then includes, max 3)
    const suggestPeopleWrap = document.getElementById("suggestPeopleWrap");
    const suggestedPeopleIds = matchContactsByName(parsed.people || [], []);
    const matchedPeople = [...suggestedPeopleIds]
      .map(id => contacts.find(c => c.id === id))
      .filter(Boolean);
    if (matchedPeople.length) {
      suggestPeopleWrap.style.display = "";
      document.getElementById("suggestPeople").innerHTML = matchedPeople.map(c =>
        `<button type="button" class="ai-chip" onclick="applyPersonSuggest(this,'${c.id}')">👤 ${esc(c.name)}</button>`
      ).join("");
    } else {
      suggestPeopleWrap.style.display = "none";
    }
  } catch (e) {
    showToast("Lỗi AI: " + e.message);
  }

  btn.innerHTML = "✦ Gợi ý AI";
  btn.disabled  = false;
  });
}

window.applyPersonSuggest = function(btn, contactId) {
  if (!formState.people.includes(contactId)) {
    formState.people.push(contactId);
    personSearch = "";
    document.getElementById("personSearchInput").value = "";
    renderPersonPicker();
  }
  btn.classList.add("used");
};

function renderSuggestChips(containerId, items, onClickFn) {
  const container = document.getElementById(containerId);
  container.innerHTML = items.map(item =>
    `<button type="button" class="ai-chip" onclick="applySuggest(this,'${esc(item)}')">${esc(item)}</button>`
  ).join("");
  container._applyFn = onClickFn;
}

window.applySuggest = function(btn, value) {
  const container = btn.closest(".ai-suggest-chips");
  container._applyFn(value);
  btn.classList.add("used");
};

/* ─────────────────────────────────────────
   SAVE MEMORY
───────────────────────────────────────── */
async function saveMemory() {
  const content = document.getElementById("memContent").value.trim();
  if (!content) { showToast("Nội dung không được trống"); return; }

  const btn = document.getElementById("btnSaveMemory");
  btn.disabled = true; btn.textContent = "Đang lưu…";

  const payload = {
    id_user: CONFIG.USER_ID, id_app: CONFIG.APP_ID,
    content,
    memory_date:        document.getElementById("memDate").value || null,
    memory_year:        document.getElementById("memYear").value ? parseInt(document.getElementById("memYear").value) : null,
    emotions:           [...formState.emotions],
    tags:               [...formState.tags],
    lesson:             document.getElementById("memLesson").value.trim() || null,
    related_people_ids: [...formState.people],
  };

  try {
    if (supabase) {
      if (editingMemoryId) {
        const { error } = await supabase.from(CONFIG.TABLE_MEMORIES)
          .update(payload).eq("id", editingMemoryId).eq("id_user", CONFIG.USER_ID);
        if (error) throw error;
        const idx = memories.findIndex(m => m.id === editingMemoryId);
        if (idx >= 0) memories[idx] = { ...memories[idx], ...payload };
      } else {
        const { data, error } = await supabase.from(CONFIG.TABLE_MEMORIES)
          .insert([payload]).select().single();
        if (error) throw error;
        memories.unshift(data);
      }
    } else {
      if (editingMemoryId) {
        const idx = memories.findIndex(m => m.id === editingMemoryId);
        if (idx >= 0) memories[idx] = { ...memories[idx], ...payload, updated_at: new Date().toISOString() };
      } else {
        memories.unshift({ id: genId(), ...payload, created_at: new Date().toISOString() });
      }
      saveLocalFallback(LS_LOCAL_MEMORIES, memories);
    }
    showToast(editingMemoryId ? "✅ Đã cập nhật ký ức" : "✅ Đã lưu ký ức");
    updateStats(); resetAddForm();
    navigate("home", document.querySelector('.nav-btn[data-screen="home"]'));
  } catch (e) {
    showToast("Lỗi lưu: " + e.message);
  }
  btn.disabled = false; btn.textContent = "Lưu ký ức";
}

/* ═══════════════════════════════════════════════════════════
   MEMORY MODAL
═══════════════════════════════════════════════════════════ */
function openMemoryModal(id) {
  const m = memories.find(x => x.id === id);
  if (!m) return;
  currentModalMemory = m;
  document.getElementById("modalDate").textContent = formatDate(m) || "Không rõ ngày";
  document.getElementById("modalContent").textContent = m.content;
  document.getElementById("modalLesson").innerHTML = m.lesson
    ? `<div class="modal-lesson"><strong>💡 Bài học:</strong> ${esc(m.lesson)}</div>` : "";

  const tags     = (m.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");
  const emotions = (m.emotions || []).map(e => `<span class="tag emotion">${esc(e)}</span>`).join("");
  // clickable person tags → filter by person
  const people = resolveContacts(m.related_people_ids)
    .map(c => `<span class="tag person" style="cursor:pointer" title="Xem ký ức của ${esc(c.name)}" onclick="closeModal();filterByPerson('${c.id}')">👤 ${esc(c.name)}</span>`)
    .join("");

  document.getElementById("modalTags").innerHTML = tags + emotions + people;
  document.getElementById("memoryModal").classList.add("show");
}

function closeModal(e) {
  if (!e || e.target === document.getElementById("memoryModal")) {
    document.getElementById("memoryModal").classList.remove("show");
    currentModalMemory = null;
  }
}

function editMemory() {
  if (!currentModalMemory) return;
  const m = currentModalMemory;
  closeModal();
  editingMemoryId = m.id;
  document.getElementById("memContent").value = m.content;
  document.getElementById("memYear").value    = m.memory_year || "";
  document.getElementById("memDate").value    = m.memory_date || "";
  document.getElementById("memLesson").value  = m.lesson || "";
  formState.tags     = [...(m.tags || [])];
  formState.emotions = [...(m.emotions || [])];
  formState.people   = [...(m.related_people_ids || [])];
  renderTagWrap(); buildEmotionGrid();
  formState.emotions.forEach(e =>
    document.querySelectorAll(".emotion-btn").forEach(b => { if (b.dataset.emotion === e) b.classList.add("selected"); })
  );
  personSearch = "";
  document.getElementById("personSearchInput").value = "";
  renderPersonPicker();
  document.getElementById("addFormTitle").textContent  = "Chỉnh sửa ký ức";
  document.getElementById("btnSaveMemory").textContent = "Cập nhật";
  document.getElementById("btnCancelEdit").style.display = "";
  navigate("add", document.querySelector('.nav-btn[data-screen="add"]'));
}

async function deleteMemoryFromModal() {
  if (!currentModalMemory) return;
  if (!confirm("Xoá ký ức này?")) return;
  const id = currentModalMemory.id;
  try {
    if (supabase) {
      const { error } = await supabase.from(CONFIG.TABLE_MEMORIES)
        .delete().eq("id", id).eq("id_user", CONFIG.USER_ID);
      if (error) throw error;
    }
    memories = memories.filter(m => m.id !== id);
    saveLocalFallback(LS_LOCAL_MEMORIES, memories);
    closeModal(); updateStats(); buildFilterRow(); applyCurrentFilter();
    showToast("🗑 Đã xoá ký ức");
  } catch (e) { showToast("Lỗi xoá: " + e.message); }
}

/* ═══════════════════════════════════════════════════════════
   EXPORT / IMPORT
═══════════════════════════════════════════════════════════ */
function exportData() {
  const data = { memories, exportedAt: new Date().toISOString(),
    config: { USER_ID: CONFIG.USER_ID, APP_ID: CONFIG.APP_ID } };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url;
  a.download = `ky-uc-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast("✅ Đã export dữ liệu");
}

function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.memories || !Array.isArray(data.memories)) throw new Error("File không hợp lệ");
      if (!confirm(`Import ${data.memories.length} ký ức?\nDữ liệu local sẽ bị ghi đè.`)) return;
      memories = data.memories;
      saveLocalFallback(LS_LOCAL_MEMORIES, memories);
      updateStats(); buildFilterRow();
      showToast(`✅ Đã import ${memories.length} ký ức`);
    } catch (err) { showToast("Lỗi import: " + err.message); }
  };
  reader.readAsText(file); e.target.value = "";
}

function clearAllData() {
  if (!confirm("Xoá tất cả memories local? Contacts không bị ảnh hưởng.")) return;
  memories = [];
  saveLocalFallback(LS_LOCAL_MEMORIES, []);
  updateStats(); buildFilterRow();
  document.getElementById("random-display").innerHTML =
    `<p class="empty-state">Nhấn nút bên dưới để gợi lại một ký ức…</p>`;
  showToast("🗑 Đã xoá memories local");
}

/* ═══════════════════════════════════════════════════════════
   GROQ API
═══════════════════════════════════════════════════════════ */
async function callGroq(messages) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.GROQ_API_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.4, max_tokens: 400 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return (await res.json()).choices?.[0]?.message?.content || "";
}

/* ═══════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════ */
function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function formatDate(m) {
  if (m.memory_date) {
    try { return new Date(m.memory_date).toLocaleDateString("vi-VN"); } catch { return m.memory_date; }
  }
  if (m.memory_year) return `Năm ${m.memory_year}`;
  return "";
}

function safeParseJSON(str) {
  try { return JSON.parse(str.replace(/```json|```/gi, "").trim()); } catch {
    const match = str.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { return null; } }
    return null;
  }
}

function genId() {
  return "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

/* ═══════════════════════════════════════════════════════════
   LINKED CONTACTS TAB (formerly inline script)
═══════════════════════════════════════════════════════════ */
function renderLinkedContacts() {
  const grid = document.getElementById("linkedContactsList");
  if (!grid) return;
  const linkedIds = new Set(memories.flatMap(m => m.related_people_ids || []));
  const linked    = contacts.filter(c => linkedIds.has(c.id));
  if (!linked.length) {
    grid.innerHTML = `<p style="color:var(--muted);font-size:0.82rem;grid-column:1/-1;padding:12px 0">Chưa có ký ức nào gắn contact.</p>`;
    return;
  }
  const memCount = {};
  memories.forEach(m => (m.related_people_ids || []).forEach(id => { memCount[id] = (memCount[id] || 0) + 1; }));
  grid.innerHTML = linked.map(c => `
    <div class="contact-card" onclick="openContactDetail('${c.id}')">
      <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="contact-card-name">${esc(c.name)}</div>
      ${c.org ? `<div class="contact-card-org">${esc(c.org)}</div>` : ""}
      <div class="contact-card-count">${memCount[c.id] || 0} ký ức</div>
    </div>`).join("");
}

function renderContactsGridFiltered(list) {
  const grid = document.getElementById("contactsGrid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<p style="color:var(--muted);font-size:0.82rem;grid-column:1/-1;text-align:center;padding:24px 0">Không tìm thấy.</p>`;
    return;
  }
  const memCount = {};
  memories.forEach(m => (m.related_people_ids || []).forEach(id => { memCount[id] = (memCount[id] || 0) + 1; }));
  grid.innerHTML = list.map(c => `
    <div class="contact-card" onclick="openContactDetail('${c.id}')">
      <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="contact-card-name">${esc(c.name)}</div>
      ${c.org ? `<div class="contact-card-org">${esc(c.org)}</div>` : ""}
      <div class="contact-card-count">${memCount[c.id] ? `${memCount[c.id]} ký ức` : "—"}</div>
    </div>`).join("");
}

function filterContactsGrid(q) {
  q = (q || "").toLowerCase();
  const filtered = q
    ? contacts.filter(c => c.name.toLowerCase().includes(q) || (c.org || "").toLowerCase().includes(q))
    : contacts;
  renderContactsGridFiltered(filtered);
}

/* ─── expose globals ─── */
window.navigate              = navigate;
window.switchListTab         = switchListTab;
window.applyFilter           = applyFilter;
window.filterByPerson        = filterByPerson;
window.openMemoryModal       = openMemoryModal;
window.closeModal            = closeModal;
window.editMemory            = editMemory;
window.deleteMemoryFromModal = deleteMemoryFromModal;
window.saveMemory            = saveMemory;
window.cancelEdit            = cancelEdit;
window.toggleEmotion         = toggleEmotion;
window.togglePersonPick      = togglePersonPick;
window.removeTag             = removeTag;
window.saveSettings          = saveSettings;
window.toggleTheme           = toggleTheme;
window.exportData            = exportData;
window.importData            = importData;
window.clearAllData          = clearAllData;
window.openContactDetail     = openContactDetail;
window.closeContactDetail    = closeContactDetail;
window.filterContactsGrid    = filterContactsGrid;
