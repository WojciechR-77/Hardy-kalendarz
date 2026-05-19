/**
 * Hardy Wyższa Forma – Training Plan → ICS Calendar File
 * Generuje plik hardy.ics który można subskrybować w Google/Apple/Outlook Calendar
 * Nie wymaga żadnych kluczy API ani autoryzacji Google.
 */

const fs = require("fs");

// ─── CONFIG ────────────────────────────────────────────────────────────────
const URLS = [
  "https://www.hardywyzszaforma.pl/post/plan-treningowy-na-tydzie%C5%84-29-07-03-08",
  "https://www.hardywyzszaforma.pl/post/plan-treningowy",
];
const DEFAULT_HOUR     = 18; // godzina treningu (18:00)
const OUTPUT_FILE      = "hardy.ics";
// ───────────────────────────────────────────────────────────────────────────

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

async function scrapePlan() {
  let bestText = "", bestModified = null;

  for (const url of URLS) {
    console.log(`📥 Pobieram: ${url}`);
    try {
      const html     = await fetchPageText(url);
      const ogDesc   = extractMeta(html, "og:description") || "";
      const modified = extractMeta(html, "article:modified_time");
      const modDate  = modified ? new Date(modified) : null;
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const bodyText  = bodyMatch ? stripHtml(bodyMatch[1]) : "";

      for (const text of [ogDesc, bodyText]) {
        if (text.includes("Czwartek") || text.includes("Tydzień")) {
          if (!bestModified || (modDate && modDate > bestModified)) {
            bestText = text; bestModified = modDate;
            console.log(`✅ Znaleziono plan (mod: ${modified || "brak daty"})`);
          }
          break;
        }
      }
    } catch (err) {
      console.warn(`⚠️  Błąd: ${err.message}`);
    }
  }

  if (!bestText) throw new Error("Nie udało się pobrać planu.");
  return bestText;
}

// ─── PARSING ───────────────────────────────────────────────────────────────

function parseDate(dayStr) {
  const p = dayStr.trim().split(".");
  return `${p[2] || new Date().getFullYear()}${p[1].padStart(2,"0")}${p[0].padStart(2,"0")}`;
}

function parsePlan(text) {
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
      currentClass = { type: line.replace(/^[⇒=>\u21d2\s]+/,"").trim(), exercises:"", method:"", duration:60 };
      currentDay.classes.push(currentClass);
      continue;
    }
    if (!currentClass) continue;
    if (/^[CĆ]wiczenia/i.test(line))    currentClass.exercises = line.replace(/^[CĆ]wiczenia[:\s]*/i,"").trim();
    else if (/^Metoda/i.test(line))      currentClass.method    = line.replace(/^Metoda[^:]*:\s*/i,"").trim();
    else if (/^Czas/i.test(line)) { const m = line.match(/(\d+)\s*min/i); if (m) currentClass.duration = parseInt(m[1]); }
  }
  if (currentDay) days.push(currentDay);
  return days;
}

// ─── ICS GENERATION ────────────────────────────────────────────────────────

function escapeIcs(str) {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatIcsDate(dateStr, hour) {
  // dateStr: "20260522", hour: 18 → "20260522T180000"
  return `${dateStr}T${String(hour).padStart(2,"0")}0000`;
}

function buildDescription(day) {
  return day.classes.map(c => {
    const parts = [`🏋️ ${c.type}`];
    if (c.exercises) parts.push(`Ćwiczenia: ${c.exercises}`);
    if (c.method)    parts.push(`Metoda: ${c.method}`);
    if (c.duration)  parts.push(`Czas: ${c.duration} min`);
    return parts.join("\\n");
  }).join("\\n\\n");
}

function generateIcs(days) {
  const now = new Date().toISOString().replace(/[-:]/g,"").split(".")[0] + "Z";

  const events = days
    .filter(d => d.classes.length > 0)
    .map(day => {
      const types   = day.classes.map(c => c.type).join(", ");
      const dtStart = formatIcsDate(day.date, DEFAULT_HOUR);
      const dtEnd   = formatIcsDate(day.date, DEFAULT_HOUR + 1) .replace("T190000","T193000"); // +1h30m
      const uid     = `hardy-${day.date}@hardy-sync`;

      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=Europe/Warsaw:${dtStart}`,
        `DTEND;TZID=Europe/Warsaw:${formatIcsDate(day.date, DEFAULT_HOUR + 1).replace(/0000$/, "3000")}`,
        `SUMMARY:${escapeIcs("🏋️ Hardy – " + types)}`,
        `DESCRIPTION:${buildDescription(day)}`,
        `LOCATION:${escapeIcs("Hardy. Wyższa Forma, ul. Nyska 59, Wrocław")}`,
        `BEGIN:VALARM`,
        `TRIGGER:-PT60M`,
        `ACTION:DISPLAY`,
        `DESCRIPTION:Trening za godzinę!`,
        `END:VALARM`,
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
    "X-WR-TIMEZONE:Europe/Warsaw",
    "X-WR-CALDESC:Plan treningowy Hardy. Wyższa Forma",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Warsaw",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏋️  Hardy ICS Generator\n");

  const text = await scrapePlan();
  const days = parsePlan(text);

  if (!days.length) {
    console.error("❌ Nie znaleziono dni treningowych.");
    console.error("Fragment tekstu:", text.substring(0, 500));
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
