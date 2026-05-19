/**
 * Hardy Wyższa Forma – Training Plan → ICS Calendar File
 * Generuje plik hardy.ics z całodniowymi wydarzeniami
 */

const fs = require("fs");

const URLS = [
  "https://www.hardywyzszaforma.pl/post/plan-treningowy-na-tydzie%C5%84-29-07-03-08",
  "https://www.hardywyzszaforma.pl/post/plan-treningowy",
];
const OUTPUT_FILE = "hardy.ics";

// ─── SCRAPING ──────────────────────────────────────────────────────────────

async function fetchPageText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "pl-PL,pl;q=0.9",
    },
  });
  return res.text();
}

function extractMeta(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/&#39;/g,"'");
  }
  return null;
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n").replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ").replace(/\s{2,}/g, " ").replace(/ \n/g, "\n");
}

async function scrapeAllTexts() {
  const texts = [];
  for (const url of URLS) {
    console.log(`📥 Pobieram: ${url}`);
    try {
      const html      = await fetchPageText(url);
      const ogDesc    = extractMeta(html, "og:description") || "";
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const bodyText  = bodyMatch ? stripHtml(bodyMatch[1]) : "";
      const modified  = extractMeta(html, "article:modified_time");

      // Zbierz wszystkie teksty które zawierają dni tygodnia
      for (const text of [ogDesc, bodyText]) {
        if (text.includes("Czwartek") || text.includes("Tydzień") || text.includes("Poniedziałek")) {
          texts.push({ text, modified });
          console.log(`  ✅ Znaleziono treść (mod: ${modified || "brak"})`);
          break;
        }
      }
    } catch (err) {
      console.warn(`  ⚠️  Błąd: ${err.message}`);
    }
  }
  return texts;
}

// ─── PARSING ───────────────────────────────────────────────────────────────

function parseDate(dayStr) {
  const p = dayStr.trim().split(".");
  const yr  = p[2] || new Date().getFullYear().toString();
  const mon = p[1].padStart(2, "0");
  const day = p[0].padStart(2, "0");
  return `${yr}${mon}${day}`;
}

function parseDays(text) {
  const lines = text.split(/[\n\r]+/).map(l => l.replace(/\s+/g," ").trim()).filter(Boolean);
  const days  = [];
  let currentDay = null, currentClass = null;
  const dayRe = /(\d{1,2}\.\d{2}(?:\.\d{4})?)\s+(Poniedziałek|Wtorek|Środa|Czwartek|Piątek|Sobota|Niedziela)/i;

  for (const line of lines) {
    const dayMatch = line.match(dayRe);
    if (dayMatch) {
      if (currentDay) days.push(currentDay);
      currentClass = null;
      currentDay = { date: parseDate(dayMatch[1]), label: line, classes: [] };
      continue;
    }
    if (!currentDay) continue;
    if (/^[⇒=>\u21d2]+\s*\S/.test(line)) {
      currentClass = { type: line.replace(/^[⇒=>\u21d2\s]+/,"").trim(), exercises:"", method:"", duration:"" };
      currentDay.classes.push(currentClass);
      continue;
    }
    if (!currentClass) continue;
    if (/^[CĆ]wiczenia/i.test(line))  currentClass.exercises = line.replace(/^[CĆ]wiczenia[:\s]*/i,"").trim();
    else if (/^Metoda/i.test(line))    currentClass.method    = line.replace(/^Metoda[^:]*:\s*/i,"").trim();
    else if (/^Czas/i.test(line)) {
      const m = line.match(/(\d+)\s*min/i);
      if (m) currentClass.duration = m[1] + " min";
    }
  }
  if (currentDay) days.push(currentDay);
  return days;
}

function mergeDays(allDayArrays) {
  // Połącz dni ze wszystkich źródeł, usuń duplikaty (wygrywa ten z więcej zajęciami)
  const map = new Map();
  for (const days of allDayArrays) {
    for (const day of days) {
      const existing = map.get(day.date);
      if (!existing || day.classes.length > existing.classes.length) {
        map.set(day.date, day);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── ICS GENERATION ────────────────────────────────────────────────────────

function escapeIcs(str) {
  return (str || "")
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;")
    .replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildDescription(day) {
  return day.classes.map(c => {
    const parts = [`🏋️ ${c.type}`];
    if (c.exercises) parts.push(`Ćwiczenia: ${c.exercises}`);
    if (c.method)    parts.push(`Metoda: ${c.method}`);
    if (c.duration)  parts.push(`Czas: ${c.duration}`);
    return parts.join("\\n");
  }).join("\\n\\n");
}

function nextDay(dateStr) {
  // dateStr: "20260522" → "20260523"
  const d = new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0,10).replace(/-/g,"");
}

function generateIcs(days) {
  const now = new Date().toISOString().replace(/[-:]/g,"").split(".")[0] + "Z";

  const events = days
    .filter(d => d.classes.length > 0)
    .map(day => {
      const types = day.classes.map(c => c.type).join(", ");
      const uid   = `hardy-${day.date}@hardy-sync`;

      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${day.date}`,
        `DTEND;VALUE=DATE:${nextDay(day.date)}`,
        `SUMMARY:${escapeIcs("🏋️ Hardy – " + types)}`,
        `DESCRIPTION:${buildDescription(day)}`,
        `LOCATION:${escapeIcs("Hardy. Wyższa Forma, ul. Nyska 59, Wrocław")}`,
        "END:VEVENT",
      ].join("\r\n");
    });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hardy Sync//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Hardy – Plan treningowy",
    "X-WR-CALDESC:Plan treningowy Hardy. Wyższa Forma",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏋️  Hardy ICS Generator\n");

  const texts = await scrapeAllTexts();

  if (!texts.length) {
    console.error("❌ Nie udało się pobrać żadnej treści.");
    process.exit(1);
  }

  const allDayArrays = texts.map(({ text }) => parseDays(text));
  const days = mergeDays(allDayArrays);

  if (!days.length) {
    console.error("❌ Nie znaleziono dni treningowych.");
    console.error("Fragment tekstu:", texts[0].text.substring(0, 800));
    process.exit(1);
  }

  console.log(`\n📋 Znaleziono ${days.length} dni:\n`);
  days.forEach(d => console.log(`  ${d.date}  ${d.classes.map(c=>c.type).join(", ") || "(brak)"}`));

  const icsContent = generateIcs(days);
  fs.writeFileSync(OUTPUT_FILE, icsContent, "utf8");

  const eventCount = days.filter(d => d.classes.length > 0).length;
  console.log(`\n✅ Zapisano ${eventCount} wydarzeń do ${OUTPUT_FILE}`);
}

main().catch(err => { console.error("\n💥", err.message); process.exit(1); });
