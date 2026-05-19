# Hardy Calendar Sync 🏋️

Automatycznie pobiera plan treningowy z hardywyzszaforma.pl i generuje plik `.ics`
który możesz **zasubskrybować** w Google Calendar, Apple Calendar lub Outlook.

**Nie wymaga żadnych kluczy API, tokenów ani konfiguracji konta Google.**

---

## Jak to działa

1. GitHub Actions co drugi dzień uruchamia skrypt
2. Skrypt pobiera plan z hardywyzszaforma.pl i generuje `hardy.ics`
3. Plik jest commitowany do repozytorium pod stałym adresem URL
4. Google Calendar subskrybuje ten URL i odświeża się automatycznie
5. GitHub wysyła e-mail po każdym uruchomieniu (sukces lub błąd)

---

## Krok 1 – Utwórz repozytorium na GitHub

1. Wejdź na **github.com** → załóż konto (jeśli nie masz) → zaloguj się
2. Kliknij **"+" → New repository**
3. Nazwa: `hardy-sync`, ustaw jako **Public** ✅ (potrzebne do subskrypcji kalendarza)
4. Kliknij **Create repository**
5. Wgraj wszystkie pliki z tego folderu do repozytorium

---

## Krok 2 – Włącz powiadomienia e-mail z GitHub

GitHub automatycznie wyśle Ci maila po każdym uruchomieniu skryptu — bez żadnej dodatkowej konfiguracji.

1. Zaloguj się na GitHub
2. Kliknij swoje zdjęcie profilowe (prawy górny róg) → **Settings**
3. Po lewej: **Notifications**
4. Znajdź sekcję **GitHub Actions**
5. Przy opcji „Send notifications for workflow runs" zaznacz **Email** ✅

---

## Krok 3 – Pierwsze uruchomienie

1. W repozytorium przejdź do zakładki **Actions**
2. Wybierz workflow **Hardy Calendar Sync**
3. Kliknij **Run workflow → Run workflow**
4. Po chwili w repozytorium pojawi się plik `hardy.ics`

---

## Krok 4 – Zasubskrybuj kalendarz

Po pierwszym uruchomieniu skopiuj ten URL (zamień `TWOJA_NAZWA` na swoją nazwę użytkownika GitHub):

```
https://raw.githubusercontent.com/TWOJA_NAZWA/hardy-sync/main/hardy.ics
```

### Google Calendar

1. Wejdź na **calendar.google.com**
2. Po lewej, przy „Inne kalendarze", kliknij **+**
3. Wybierz **Z adresu URL**
4. Wklej URL powyżej → **Dodaj kalendarz**

### Apple Calendar (iPhone / Mac)

1. Ustawienia → Kalendarz → Konta → Dodaj konto → Inne
2. Dodaj subskrybowany kalendarz → wklej URL

### Outlook

1. Dodaj kalendarz → Subskrybuj z sieci Web → wklej URL

---

## Harmonogram

Skrypt odpala się **co drugi dzień o 8:00 rano**. Jeśli plan się zmienił,
plik `hardy.ics` zostaje zaktualizowany w repozytorium, a Twój kalendarz
odświeży się przy kolejnym sprawdzeniu (Google Calendar robi to zwykle co kilka godzin).

---

## Struktura plików

```
hardy-sync/
├── index.js                       # główny skrypt – scraping + generowanie ICS
├── package.json
├── .gitignore
└── .github/
    └── workflows/
        └── sync.yml               # harmonogram i konfiguracja GitHub Actions
```

---

## Rozwiązywanie problemów

**Plik `hardy.ics` jest pusty lub brak wydarzeń**
Hardy mogło zmienić format strony. Sprawdź logi w zakładce Actions
(kliknij konkretne uruchomienie → krok „Generuj plik ICS") i prześlij mi
wypisany fragment tekstu — poprawię parser.

**Kalendarz nie aktualizuje się**
Google Calendar odświeża subskrybowane kalendarze co kilka godzin (czasem do 24h).
Możesz wymusić odświeżenie: w Google Calendar kliknij nazwę kalendarza → menu (⋮) → Odśwież.

**Workflow nie uruchamia się automatycznie**
GitHub może dezaktywować harmonogram jeśli repozytorium jest nieaktywne przez 60 dni.
W takim razie wejdź w Actions i ręcznie kliknij „Run workflow" — to go reaktywuje.
