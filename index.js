/**
 * Hardy Wyższa Forma – Training Plan → ICS Calendar File
 */

const fs = require("fs");

const POST_URLS = [
  "https://www.hardywyzszaforma.pl/post/plan-treningowy-na-tydzie%C5%84-29-07-03-08",
  "https://www.hardywyzszaforma.pl/post/plan-treningowy",
];
const RSS_URLS = [
  "https://www.hardywyzszaforma.pl/blog-feed.xml",
  "https://www.hardywyzszaforma.pl/feed.xml",
  "https://www.hardywyzszaforma.pl/blog/feed.xml",
];
const OUTPUT_FILE = "hardy.ics";

// ─── SCRAPING ──────────────────────────────────────────────────────────────

async function fetchText(url, userAgent) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "pl-PL,pl;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractMeta(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/&#39;/g,"'").replace(/&#x27;/g,"'");
  }
  return null;
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n").replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&nbsp;/g, " ").replace(/&#39;/g,"'")
    .replace(/\s{2,}/g, " ").replace(/ \n/g, "\n");
}

function hasTrainingContent(text) {
  return text.includes("Czwartek") || text.includes("Tydzień") ||
         text.includes("Poniedziałek") || text.includes("Ćwiczenia");
}

// Próbuje wyciągnąć tekst z RSS (CDATA w description)
function extractFromRss(xml) {
  const texts = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let item;
  while ((item = itemRe.exec(xml)) !== null) {
    const content = item[1];
    // Szukaj w content:encoded lub description
    const cdataRe = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;
    let cdata;
    while ((cdata = cdataRe.exec(content)) !== null) {
      const text = stripHtml(cdata[1]);
      if (hasTrainingContent(text)) texts.push(text);
    }
    // Bez CDATA
    const descMatch = content.match(/<description>([\s\S]*?)<\/description>/i);
    if (descMatch) {
      const text = stripHtml(descMatch[1]);
      if (hasTrainingContent(text)) texts.push(text);
    }
  }
  return texts;
}

async function scrapeAllTexts() {
  const texts = [];

  // 1. Spróbuj RSS
  console.log("🔍 Szukam RSS feed...");
  for (const url of RSS_URLS) {
    try {
      const xml = await fetchText(url);
      const rssTexts = extractFromRss(xml);
      if (rssTexts.length) {
        console.log(`  ✅ RSS działa: ${url} (${rssTexts.length} postów)`);
        texts.push(...rssTexts.map(text => ({ text, source: "rss" })));
        break;
      }
    } catch (err) {
      console.log(`  ⏭  RSS ${url}: ${err.message}`);
    }
  }

  // 2. Pobierz strony postów (zwykły UA + Googlebot)
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
  ];

  for (const url of POST_URLS) {
    for (const ua of userAgents) {
      console.log(`📥 Pobieram: ${url} [${ua.startsWith("Google") ? "Googlebot" : "Chrome"}]`);
      try {
        const html      = await fetchText(url, ua);
        const ogDesc    = extractMeta(html, "og:description") || "";
        const modified  = extractMeta(html, "article:modified_time");

        // Szukaj treści w tagach script (Wix osadza JSON)
        const scriptTexts = [];
        const scriptRe = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let sm;
        while ((sm = scriptRe.exec(html)) !== null) {
          try {
            const obj = JSON.parse(sm[1]);
            const str = JSON.stringify(obj);
            if (hasTrainingContent(str)) scriptTexts.push(str.replace(/\\n/g,"\n").replace(/\\t/g," "));
          } catch {}
        }

        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyText  = bodyMatch ? stripHtml(bodyMatch[1]) : "";

        for (const [label, text] of [["og:description", ogDesc], ["script JSON", scriptTexts.join("\n")], ["body", bodyText]]) {
          if (text && hasTrainingContent(text)) {
            texts.push({ text, source: label, modified });
            console.log(`  ✅ Znaleziono w ${label} (mod: ${modified || "brak"})`);
            break;
          }
        }
      } catch (err) {
        console.warn(`  ⚠️  Błąd: ${err.message}`);
      }
    }
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

// ─── ICS GENERATION ────────────────────────────────────────────────────────

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
  const now = new Date().toISOString().replace(/[-:]/g,"").split(".")[0]+"Z";
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
    "CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "X-WR-CALNAME:Hardy – Plan treningowy",
    ...events,"END:VCALENDAR"].join("\r\n");
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏋️  Hardy ICS Generator\n");
  const texts = await scrapeAllTexts();

  if (!texts.length) { console.error("❌ Brak treści."); process.exit(1); }

  const days = mergeDays(texts.map(({text}) => parseDays(text)));

  if (!days.length) {
    console.error("❌ Nie znaleziono dni. Fragment tekstu:");
    console.error(texts[0].text.substring(0, 1000));
    process.exit(1);
  }

  console.log(`\n📋 Znaleziono ${days.length} dni:\n`);
  days.forEach(d => console.log(`  ${d.date}  ${d.classes.map(c=>c.type).join(", ")||"(brak)"}`));

  fs.writeFileSync(OUTPUT_FILE, generateIcs(days), "utf8");
  console.log(`\n✅ Zapisano ${days.filter(d=>d.classes.length>0).length} wydarzeń do ${OUTPUT_FILE}`);
}

main().catch(err => { console.error("\n💥", err.message); process.exit(1); });
