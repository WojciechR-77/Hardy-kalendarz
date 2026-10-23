/**
 * Hardy Wyższa Forma – Training Plan → ICS Calendar File
 * Używa Puppeteer do pełnego renderowania JavaScript (Wix)
 */

const fs = require("fs");
const puppeteer = require("puppeteer-core");

const URLS = [
  "https://www.hardywyzszaforma.pl/post/plan-treningowy-na-tydzie%C5%84-29-07-03-08",
  "https://www.hardywyzszaforma.pl/post/plan-treningowy",
];
const OUTPUT_FILE = "hardy.ics";

// ─── SCRAPING ──────────────────────────────────────────────────────────────

async function scrapeAllTexts() {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  console.log("🌐 Uruchamiam przeglądarkę...");
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const texts = [];

  try {
    for (const url of URLS) {
      console.log(`📥 Pobieram: ${url}`);
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");

      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000)); // czekaj na JS

        const text = await page.evaluate(() => {
          const selectors = [
            "[data-hook='post-description']",
            "[class*='post-content']",
            "[class*='blog-post']",
            "article",
            "main",
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.innerText.length > 200) return el.innerText;
          }
          return document.body.innerText;
        });

        if (text.includes("Czwartek") || text.includes("Tydzień") || text.includes("Poniedziałek")) {
          texts.push(text);
          const days = (text.match(/(Poniedziałek|Wtorek|Środa|Czwartek|Piątek|Sobota|Niedziela)/gi) || []).length;
          console.log(`  ✅ Pobrano (${days} dni tygodnia w tekście)`);
        } else {
          console.log(`  ⚠️  Brak treści planu`);
        }
      } catch (err) {
        console.warn(`  ⚠️  Błąd: ${err.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return texts;
}

// ─── PARSING ───────────────────────────────────────────────────────────────

function parseDate(dayStr) {
  const p  = dayStr.trim().split(".");
  const yr = p[2] || new Date().getFullYear().toString();
  return `${yr}${p[1].padStart(2,"0")}${p[0].padStart(2,"0")}`;
}

function parseDays(text) {
  const lines = text.split(/[\n\r]+/).map(l => l.replace(/\s+/g," ").trim()).filter(Boolean);
  const days  = [];
  let cur = null, cls = null;
  const dayRe = /(\d{1,2}\.\d{2}(?:\.\d{4})?)\s+(Poniedziałek|Wtorek|Środa|Czwartek|Piątek|Sobota|Niedziela)/i;

  for (const line of lines) {
    const dm = line.match(dayRe);
    if (dm) {
      if (cur) days.push(cur);
      cls = null;
      cur = { date: parseDate(dm[1]), label: line, classes: [] };
      continue;
    }
    if (!cur) continue;
    if (/^[⇒=>\u21d2]+\s*\S/.test(line)) {
      cls = { type: line.replace(/^[⇒=>\u21d2\s]+/,"").trim(), exercises:"", method:"", duration:"" };
      cur.classes.push(cls);
      continue;
    }
    if (!cls) continue;
    if (/^[CĆ]wiczenia/i.test(line))  cls.exercises = line.replace(/^[CĆ]wiczenia[:\s]*/i,"").trim();
    else if (/^Metoda/i.test(line))    cls.method    = line.replace(/^Metoda[^:]*:\s*/i,"").trim();
    else if (/^Czas/i.test(line)) { const m = line.match(/(\d+)\s*min/i); if (m) cls.duration = m[1]+" min"; }
  }
  if (cur) days.push(cur);
  return days;
}

function mergeDays(allArrays) {
  const map = new Map();
  for (const arr of allArrays) {
    for (const day of arr) {
      const ex = map.get(day.date);
      if (!ex || day.classes.length > ex.classes.length) map.set(day.date, day);
    }
  }
  return Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date));
}

// ─── ICS ───────────────────────────────────────────────────────────────────

function escIcs(s) {
  return (s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
}

function buildDesc(day) {
  return day.classes.map(c => {
    const p = [`🏋️ ${c.type}`];
    if (c.exercises) p.push(`Ćwiczenia: ${c.exercises}`);
    if (c.method)    p.push(`Metoda: ${c.method}`);
    if (c.duration)  p.push(`Czas: ${c.duration}`);
    return p.join("\\n");
  }).join("\\n\\n");
}

function nextDay(d) {
  const dt = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`);
  dt.setDate(dt.getDate()+1);
  return dt.toISOString().slice(0,10).replace(/-/g,"");
}

function generateIcs(days) {
  const now    = new Date().toISOString().replace(/[-:]/g,"").split(".")[0]+"Z";
  const events = days.filter(d=>d.classes.length>0).map(day => [
    "BEGIN:VEVENT",
    `UID:hardy-${day.date}@hardy-sync`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${day.date}`,
    `DTEND;VALUE=DATE:${nextDay(day.date)}`,
    `SUMMARY:${escIcs("🏋️ Hardy – "+day.classes.map(c=>c.type).join(", "))}`,
    `DESCRIPTION:${buildDesc(day)}`,
    `LOCATION:${escIcs("Hardy. Wyższa Forma, ul. Nyska 59, Wrocław")}`,
    "END:VEVENT",
  ].join("\r\n"));

  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Hardy Sync//PL",
    "CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Hardy – Plan treningowy",
    ...events,"END:VCALENDAR"].join("\r\n");
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏋️  Hardy ICS Generator\n");
  const texts = await scrapeAllTexts();

  if (!texts.length) { console.error("❌ Brak treści."); process.exit(1); }

  const days = mergeDays(texts.map(t => parseDays(t)));

  if (!days.length) {
    console.error("❌ Nie znaleziono dni. Fragment tekstu:");
    console.error(texts[0].substring(0,1000));
    process.exit(1);
  }

  console.log(`\n📋 Znaleziono ${days.length} dni:\n`);
  days.forEach(d => console.log(`  ${d.date}  ${d.classes.map(c=>c.type).join(", ")||"(brak)"}`));

  fs.writeFileSync(OUTPUT_FILE, generateIcs(days), "utf8");
  console.log(`\n✅ Zapisano ${days.filter(d=>d.classes.length>0).length} wydarzeń do ${OUTPUT_FILE}`);
}

main().catch(err => { console.error("\n💥", err.message); process.exit(1); });
