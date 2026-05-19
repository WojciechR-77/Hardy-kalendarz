# Hardy Calendar Sync 🏋️

Automatycznie pobiera plan treningowy z hardywyzszaforma.pl i generuje plik `.ics`
który możesz **zasubskrybować** w Google Calendar, Apple Calendar lub Outlook.

**Nie wymaga żadnego Google Cloud, API ani tokenów.**

---

## Jak to działa

1. GitHub Actions co drugi dzień uruchamia skrypt
2. Skrypt pobiera plan z hardywyzszaforma.pl i generuje `hardy.ics`
3. Plik jest commitowany do repozytorium pod stałym URL
4. Google Calendar subskrybuje ten URL i odświeża się automatycznie

---

## Krok 1 – Utwórz repozytorium na GitHub

1. Wejdź na **github.com** → załóż konto (jeśli nie masz) → zaloguj się
2. Kliknij **"+" → New repository**
3. Nazwa: `hardy-sync`, ustaw jako **Public** ✅ (potrzebne do subskrypcji kalendarza)
4. Kliknij **Create repository**
5. Wgraj wszystkie pliki z tego folderu

---

## Krok 2 – Dodaj Secrets do maila (jedyne co musisz skonfigurować)

Skrypt wysyła e-mail po każdym uruchomieniu. Potrzebujesz hasła aplikacji Gmail:

### Utwórz hasło aplikacji Gmail

1. Wejdź na **myaccount.google.com → Bezpieczeństwo**
2. Włącz **Weryfikację dwuetapową** (jeśli jeszcze nie masz)
3. Wróć do Bezpieczeństwo → **Hasła do aplikacji**
4. Wybierz: Poczta + Komputer Windows → **Generuj**
5. Skopiuj 16-znakowe hasło

### Dodaj Secrets w GitHub

W repozytorium: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|-------|
| `MAIL_USERNAME` | rozniaste9@gmail.com |
| `MAIL_APP_PASSWORD` | 16-znakowe hasło z kroku wyżej |

---

## Krok 3 – Pierwsze uruchomienie

1. Zakładka **Actions** w repozytorium
2. Wybierz **Hardy Calendar Sync**
3. Kliknij **Run workflow → Run workflow**
4. Po chwili pojawi się plik `hardy.ics` w repozytorium

---

## Krok 4 – Subskrybuj kalendarz

Po pierwszym uruchomieniu skopiuj ten URL (zamień `TWOJA_NAZWA` na swoją nazwę użytkownika GitHub):

```
https://raw.githubusercontent.com/TWOJA_NAZWA/hardy-sync/main/hardy.ics
```

### Google Calendar

1. Wejdź na **calendar.google.com**
2. Po lewej przy „Inne kalendarze" kliknij **+**
3. Wybierz **Z adresu URL**
4. Wklej URL powyżej → **Dodaj kalendarz**

### Apple Calendar (iPhone/Mac)

1. Ustawienia → Kalendarz → Konta → Dodaj konto → Inne
2. Dodaj subskrybowany kalendarz → wklej URL

### Outlook

1. Dodaj kalendarz → Subskrybuj z sieci Web → wklej URL

---

## Harmonogram

Skrypt odpala się co drugi dzień o 8:00 rano. Po każdym uruchomieniu
dostaniesz e-mail z logiem (OK lub BŁĄD).

---

## Rozwiązywanie problemów

**Plik ics jest pusty / brak wydarzeń**
Hardy mogło zmienić format strony. Sprawdź logi w Actions i daj mi fragment tekstu – poprawię parser.

**Mail nie przychodzi**
Sprawdź czy Secret `MAIL_APP_PASSWORD` jest poprawnie ustawiony. Hasło aplikacji wygląda tak: `abcd efgh ijkl mnop`
