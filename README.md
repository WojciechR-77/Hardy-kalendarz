# Hardy Calendar Sync 🏋️

Automatycznie pobiera plan treningowy z hardywyzszaforma.pl i generuje plik `.ics`
który możesz **zasubskrybować** w Google Calendar, Apple Calendar lub Outlook.

**Nie wymaga żadnych kluczy API, tokenów ani konfiguracji konta Google.**

---

## Jak to działa

1. GitHub Actions co drugi dzień uruchamia skrypt
2. Skrypt pobiera plan z hardywyzszaforma.pl przez przeglądarkę (Puppeteer + Chromium)
3. Generuje plik `hardy.ics` i commituje go do repozytorium
4. Google Calendar subskrybuje plik przez GitHub Pages i odświeża się automatycznie

---

## Subskrypcja kalendarza

```
https://wojciechr-77.github.io/Hardy-kalendarz/hardy.ics
```

### Google Calendar
1. Wejdź na **calendar.google.com**
2. Po lewej, przy „Inne kalendarze", kliknij **+**
3. Wybierz **Z adresu URL** → wklej URL → **Dodaj kalendarz**

### Apple Calendar (iPhone / Mac)
1. Ustawienia → Kalendarz → Konta → Dodaj konto → Inne
2. Dodaj subskrybowany kalendarz → wklej URL

### Outlook
1. Dodaj kalendarz → Subskrybuj z sieci Web → wklej URL

---

## Harmonogram

Skrypt odpala się **co drugi dzień o 8:00 rano**. Jeśli plan się zmienił,
`hardy.ics` zostaje zaktualizowany, a kalendarz odświeży się automatycznie
przy kolejnym sprawdzeniu (Google Calendar robi to co kilka godzin).

Możesz też uruchomić skrypt ręcznie: zakładka **Actions** → **Hardy Calendar Sync** → **Run workflow**.

---

## Powiadomienia e-mail

GitHub wysyła e-mail gdy workflow zakończy się błędem. Aby to włączyć:

1. GitHub → zdjęcie profilowe → **Settings**
2. Po lewej: **Notifications**
3. Sekcja **GitHub Actions** → zaznacz **Email**

---

## Struktura plików

```
Hardy-kalendarz/
├── index.js                       # scraping (Puppeteer) + generowanie ICS
├── package.json                   # zależność: puppeteer
├── .gitignore
├── hardy.ics                      # generowany automatycznie – nie edytuj ręcznie
└── .github/
    └── workflows/
        └── sync.yml               # harmonogram GitHub Actions
```

---

## Rozwiązywanie problemów

**Brak wydarzeń w kalendarzu**
Upewnij się że subskrybujesz URL z GitHub Pages (`github.io`), nie z `raw.githubusercontent.com`.
Google Calendar nie akceptuje pliku serwowanego z raw.githubusercontent.com.

**Kalendarz nie aktualizuje się**
Google Calendar odświeża subskrypcje co kilka godzin. Możesz wymusić odświeżenie:
calendar.google.com → trzy kropki ⋮ obok kalendarza Hardy → **Odśwież**.

**Workflow nie uruchamia się automatycznie**
GitHub dezaktywuje harmonogram po 60 dniach nieaktywności repozytorium.
Wejdź w Actions → Hardy Calendar Sync → **Run workflow** — to reaktywuje harmonogram.

**Błąd w logu Actions**
Hardy mogło zmienić format strony. Sprawdź logi kroku „Generuj plik ICS"
i prześlij mi fragment tekstu — poprawię parser.
