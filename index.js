/**
 * Hardy Wyższa Forma – Training Plan → ICS Calendar File
 * Wersja 7: strona "SYSTEM TRENINGOWY" + przeklikiwanie kolejnych tygodni
 */

const fs = require("fs");
const puppeteer = require("puppeteer-core");

const URL         = "https://strefa.hardywyzszaforma.pl/program";
const PASSWORD    = process.env.HARDY_PASSWORD;
const OUTPUT_FILE = "hardy.ics";
const KEEP_DAYS   = 60; // ile dni wstecz zachowywać stare wydarzenia
const MAX_WEEKS   = 4;  // ile tygodni w przód przeklikać

if (!PASSWORD) {
  console.error("❌ Brak hasła. Ustaw Secret HARDY_PASSWORD w GitHub.");
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── SCRAPING ──────────────────────────────────────────────────────────────

async function login(page) {
  const input = await page.$("input[type='password']");
  if (!input) {
    console.log("  ℹ️  Brak pola hasła na stronie (może już jest otwarta)");
    return;
  }
  console.log("  🔑 Znaleziono pole hasła, loguję...");
  await input.click();
  await input.type(PASSWORD, { delay: 50 });
  await page.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  await sleep(3000);

  const still = await page.$("input[type='password']");
  if (still) console.log("  ⚠️  Pole hasła nadal widoczne – logowanie mogło się nie udać");
  else       console.log("  ✅ Zalogowano");
}

// Daty z zakładek dni na górze strony, np. ["19.10","20.10",...,"25.10"]
async function getTabDates(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length === 0 && /^\d{1,2}\.\d{2}$/.test(el.textContent.trim())) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) out.push(el.textContent.trim());
      }
    }
    return out;
  });
}

// Klika przycisk "›" (następny tydzień) – szuka klikalnego elementu
// na prawo od ostatniej zakładki z datą, na tej samej wysokości
async function clickNextWeek(page) {
  return page.evaluate(() => {
    let tab = null;
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length === 0 && /^\d{1,2}\.\d{2}$/.test(el.textContent.trim())) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (!tab || r.right > tab.right)) tab = r;
      }
    }
    if (!tab) return "brak zakładek z datami";

    const cy = (tab.top + tab.bottom) / 2;
    const fits = r => r.width > 0 && r.height > 0 && r.left >= tab.right - 5 &&
                      Math.abs((r.top + r.bottom) / 2 - cy) <= Math.max(r.height, 30);

    let best = null;
    const pick = (el, r) => { if (!best || r.left > best.r.left) best = { el, r }; };

    for (const el of document.querySelectorAll("button, [role='button'], a")) {
      const r = el.getBoundingClientRect();
      if (!fits(r)) continue;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
      pick(el, r);
    }
    if (!best) {
      // zapasowo: cokolwiek z kursorem "pointer"
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (!fits(r)) continue;
        if (getComputedStyle(el).cursor !== "pointer") continue;
        pick(el, r);
      }
    }
    if (!best) return "nie znaleziono przycisku następnego tygodnia";
    best.el.click();
    return "ok";
  });
}

async function scrapeTexts() {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  console.log("🌐 Uruchamiam przeglądarkę...");
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");
    await page.authenticate({ username: "", password: PASSWORD });

    console.log(`📥 Pobieram: ${URL}`);
    await page.goto(URL, { waitUntil: "networkidle2", timeout: 45000 });
    await sleep(2000);

    await login(page);

    const texts = [];
    let prevDates = await getTabDates(page);
    console.log(`  📅 Bieżący tydzień: ${prevDates[0]} – ${prevDates[prevDates.length - 1]}`);
    texts.push(await page.evaluate(() => document.body.innerText));

    for (let w = 1; w <= MAX_WEEKS; w++) {
      const res = await clickNextWeek(page);
      if (res !== "ok") { console.log(`  ⏹  Koniec przeklikiwania: ${res}`); break; }

      // czekaj aż zmienią się daty w zakładkach (max ~8 s)
      let dates = prevDates;
      for (let t = 0; t < 8 && dates.join() === prevDates.join(); t++) {
        await sleep(1000);
        dates = await getTabDates(page);
      }
      if (dates.join() === prevDates.join()) {
        console.log("  ⏹  Daty się nie zmieniły – brak kolejnych tygodni");
        break;
      }
      await sleep(1000);
      console.log(`  ➡️  Tydzień +${w}: ${dates[0]} – ${dates[dates.length - 1]}`);
      texts.push(await page.evaluate(() => document.body.innerText));
      prevDates = dates;
    }

    console.log(`  📄 Pobrano ${texts.length} widok(ów) tygodnia`);
    return texts;
  } finally {
    await browser.close();
  }
}

// ─── PARSING ───────────────────────────────────────────────────────────────

const MONTHS = {
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, września: 9, października: 10, listopada: 11, grudnia: 12,
};
const WEEKDAY_RE = /^(PONIEDZIAŁEK|WTOREK|ŚRODA|CZWARTEK|PIĄTEK|SOBOTA|NIEDZIELA)$/i;

// "23 października" → "20261023"
function parsePolishDate(s) {
  const m = (s || "").match(/^(\d{1,2})\s+([a-ząćęłńóśźż]+)/i);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const day = parseInt(m[1]);
  const now = new Date();
  let year  = now.getFullYear();
  const diffDays = (new Date(year, month - 1, day) - now) / 86400000;
  if (diffDays < -180) year += 1;   // przełom roku: grudzień → styczeń
  if (diffDays >  180) year -= 1;
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function parseDays(text) {
  const lines = text.split(/[\n\r]+/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Lista programów z filtra na górze strony (WSZYSTKIE, ATHLETIC, SPEED, BALANCE, ...)
  const programs = new Set(["ATHLETIC", "SPEED", "BALANCE"]);
  const idx = lines.indexOf("WSZYSTKIE");
  if (idx !== -1) {
    for (let i = idx + 1; i < lines.length && i < idx + 15; i++) {
      if (/^\d/.test(lines[i]) || WEEKDAY_RE.test(lines[i])) break;
      if (/^[A-ZĄĆĘŁŃÓŚŹŻ &\-]+$/.test(lines[i])) programs.add(lines[i]);
    }
  }

  const days = [];
  let cur = null, cls = null, pending = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Nagłówek dnia: "PIĄTEK" / "," / "23 października"
    if (WEEKDAY_RE.test(line)) {
      const hasComma = lines[i + 1] === ",";
      const dateLine = hasComma ? lines[i + 2] : lines[i + 1];
      const date     = parsePolishDate(dateLine);
      if (date) {
        if (cur) days.push(cur);
        cur = { date, label: `${line} ${dateLine}`, classes: [] };
        cls = null; pending = null;
        i += hasComma ? 2 : 1;
        continue;
      }
    }
    if (!cur) continue;

    // Początek zajęć: "ATHLETIC" / "KALISTENIKA" / "CZAS:"
    if (programs.has(line) && lines[i + 1] && lines[i + 2] === "CZAS:") {
      cls = { program: line, name: lines[i + 1], duration: "", room: "", items: [] };
      cur.classes.push(cls);
      pending = null;
      i += 1;
      continue;
    }
    if (!cls) continue;

    if (line === "CZAS:")                 { cls.duration = (lines[i + 1] || "").toLowerCase(); i += 1; continue; }
    if (/^SALA /i.test(line))             { cls.room = line; continue; }
    if (/^OPIS I WSKAZÓWKI$/i.test(line)) { cls = null; pending = null; continue; }

    // Etykiety: "A" / "B" (sekcja), "A1" / "B2" / "1" / "2" (ćwiczenie)
    if (/^[A-Z]$/.test(line) || /^[A-Z]\d+$/.test(line) || /^\d+$/.test(line)) {
      pending = line;
      continue;
    }
    cls.items.push({ label: pending, text: line });
    pending = null;
  }
  if (cur) days.push(cur);
  return days;
}

// Łączy dni z kilku widoków tygodnia; przy duplikacie wygrywa dzień z większą liczbą zajęć
function mergeDays(arrays) {
  const map = new Map();
  for (const days of arrays) {
    for (const d of days) {
      const ex = map.get(d.date);
      if (!ex || d.classes.length > ex.classes.length) map.set(d.date, d);
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ─── ICS ───────────────────────────────────────────────────────────────────

function escIcs(s) {
  return (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildSummary(day) {
  const byProgram = new Map();
  for (const c of day.classes) {
    if (!byProgram.has(c.program)) byProgram.set(c.program, []);
    byProgram.get(c.program).push(c.name);
  }
  return [...byProgram].map(([p, names]) => `${p}: ${names.join(", ")}`).join(" · ");
}

function buildDesc(day) {
  return day.classes.map(c => {
    const meta  = [c.duration, c.room].filter(Boolean).join(", ");
    const lines = [`🏋️ ${c.program} – ${c.name}${meta ? ` (${meta})` : ""}`];
    for (const it of c.items) {
      if (!it.label)                     lines.push(it.text);
      else if (/^[A-Z]$/.test(it.label)) lines.push(`${it.label}) ${it.text}`);
      else                               lines.push(`   ${it.label} ${it.text}`);
    }
    return lines.join("\n");
  }).join("\n\n");
}

function nextDay(d) {
  const dt = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

// Stare wydarzenia z poprzedniego hardy.ics – strona pokazuje bieżący tydzień
// tylko od dziś, więc minione dni zachowujemy z poprzedniej wersji pliku
function loadExistingEvents() {
  if (!fs.existsSync(OUTPUT_FILE)) return [];
  const content = fs.readFileSync(OUTPUT_FILE, "utf8");
  const blocks  = content.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks
    .map(b => ({ date: (b.match(/DTSTART;VALUE=DATE:(\d{8})/) || [])[1], block: b }))
    .filter(e => e.date);
}

function generateIcs(days) {
  const now    = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10).replace(/-/g, "");

  const fresh      = days.filter(d => d.classes.length > 0);
  const freshDates = new Set(fresh.map(d => d.date));

  const newEvents = fresh.map(day => [
    "BEGIN:VEVENT",
    `UID:hardy-${day.date}@hardy-sync`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${day.date}`,
    `DTEND;VALUE=DATE:${nextDay(day.date)}`,
    `SUMMARY:${escIcs("🏋️ Hardy – " + buildSummary(day))}`,
    `DESCRIPTION:${escIcs(buildDesc(day))}`,
    `LOCATION:${escIcs("Hardy. Wyższa Forma, ul. Nyska 59, Wrocław")}`,
    "END:VEVENT",
  ].join("\r\n"));

  const kept = loadExistingEvents()
    .filter(e => !freshDates.has(e.date) && e.date >= cutoff)
    .map(e => e.block);

  console.log(`  🗂  Nowe: ${newEvents.length}, zachowane z poprzedniego pliku: ${kept.length}`);

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hardy Sync//PL",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Hardy – Plan treningowy",
    ...kept, ...newEvents, "END:VCALENDAR"].join("\r\n");
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏋️  Hardy ICS Generator v7\n");
  const texts = await scrapeTexts();
  const days  = mergeDays(texts.map(parseDays));

  if (!days.length) {
    console.error("\n❌ Nie znaleziono dni treningowych. Początek tekstu strony (do diagnozy):\n");
    console.error((texts[0] || "").substring(0, 1500));
    process.exit(1);
  }

  console.log(`\n📋 Znaleziono ${days.length} dni:\n`);
  days.forEach(d => console.log(`  ${d.date}  ${d.classes.length} zajęć: ${buildSummary(d) || "(brak)"}`));

  fs.writeFileSync(OUTPUT_FILE, generateIcs(days), "utf8");
  console.log(`\n✅ Zapisano ${OUTPUT_FILE}`);
}

main().catch(err => { console.error("\n💥", err.message); process.exit(1); });
