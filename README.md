# חיפוש טבלאי בסגנון בר-אילן – תוסף לאוצריא

תוסף לאוצריא למי שמגיע מתוכנת בר-אילן (פרויקט השו"ת). סידור המסך והאפשרויות נשארו כמו בבר-אילן:
סרגל סוגי החיפוש מימין, הטופס באמצע ועמודת הפעולות משמאל. הצבעים, הגופנים והצורות מגיעים מערכת
הנושא של אוצריא, במצב בהיר ובמצב כהה.

* שם: "חיפוש טבלאי". מזהה: `community.yahel.table-search`, גרסה 2.0.1. זה עדכון לתוסף "חיפוש טבלאי" הקיים (1.10.5).
* **קרדיט:** מבוסס על התוסף המקורי מאת יהל, סנאי ויפל. גם שדה `author` במניפסט ודיאלוג העזרה מציינים זאת.
  **שאלת הרישיון של התוסף המקורי עדיין פתוחה.** לא הועתק קוד מהמקור. המבנה והרעיונות נכתבו מחדש.
* דרישה: אוצריא 0.9.98.1 ומעלה.
* הרשאות: `search.fulltext.read`, `reader.open`, `library.books.read`.
* התקנה: פותחים את הקובץ `dist/bar-ilan-table-search-2.0.1.otzplugin` באוצריא (תוספים ← התקנה מקובץ).

## סוגי החיפוש

| בר-אילן | בתוסף |
|---|---|
| חיפוש טבלאי | מלא: 4 מרכיבים, ובכל אחד מילה ו-3 חלופות ("או"). בין המרכיבים "וגם". מרחקים, מאפייני מרכיב ומאפייני חיפוש |
| חיפוש קל | מלא: ללא תוספות או עם תוספות (קידומות דקדוקיות למילה הראשונה, עד 2 מילים בין מילות החיפוש, כתיב מלא) |
| חיפוש מתקדם | שורת תחביר של בר-אילן (`# * ! + $ % ^ - <> ( / )`, `[4:1]`, `[4:4-]`, `10:`, `פסקה:`) וכפתורי האופרטורים. "הצג בטבלה" ו"ערוך כתחביר" מעבירים שאילתה בין הטופס המתקדם לטבלה |
| ניסוח חופשי | ≈ לאוצריא אין חיפוש בשפה טבעית. השאלה נפתחת בחיפוש של אוצריא בלי להריץ |
| המאגרים המשתתפים | עץ מקורות עד רמת ספר, עם בחירה חלקית. כתיבת מקורות וקטלוג (חיפוש ספר לפי שם), קבוצות מאגרים, תקופות, "בחר הכל" ו"התחל שוב" |

### הקלדה בטבלה

כמו בבר-אילן, בכל שדה נכתבת מילה אחת:
* רווח לא נכתב בשדה, אלא מעביר לשדה הבא, באותו סדר כמו Tab: שורה אחר שורה, מרכיב 1 ← 2 ← 3 ← 4.
  כשהסמן באמצע מילה והשדה הבא ריק, החלק שאחרי הסמן עובר לשדה הבא. בשדה האחרון הרווח לא עושה כלום.
* הדבקה של כמה מילים ממלאת את השדה הנוכחי ואת השדות שאחריו, מילה בכל שדה.
* מקף לא מפצל מילה, ולכן שדה עם מקף מסומן כשגוי, כי אוצריא מפרקת אותו לשתי מילים.
* הטבלה ברוחב קבוע ואינה נמתחת עם החלון. רשימת התוצאות רחבה יותר, אבל גם היא מוגבלת לשורת קריאה נוחה.

## מאפייני המרכיב

לוחצים על שדה ואז על מאפיין, או Alt+האות. האות מופיעה משמאל לשדה, כמו בבר-אילן, ולחיצה עליה מסירה אותה.
"סימון כל הרכיבים" מחיל את המאפיין הבא על כל השדות המלאים.

| אות | מאפיין | באוצריא |
|---|---|---|
| ק | קידומות דקדוקיות | ✓ `קידומות דקדוקיות` |
| ס | סיומות דקדוקיות | ✓ `סיומות דקדוקיות` |
| ח | כתיב מלא/חסר | ✓ `כתיב מלא/חסר` |
| ג | עם/בלי גרשיים | ✓ `התעלם מגרשיים` |
| א | תרגום לארמית | ✓ `תרגום ארמי` |
| ד | קידומות | ≈ `קידומות`: עד 3 אותיות (במילה קצרה עד 5). ללא הגבלה רק עם `*` |
| מ | סיומות | ≈ `סיומות`: עד 5 אותיות (במילה קצרה עד 7) |
| ע | ערך | ≈ אין מילון ערכים. במקומו קידומות וסיומות דקדוקיות וכתיב מלא/חסר |
| ש | שורש | ≈ אין ניתוח שורשים. אותה החלפה כמו ב-ע. לנטיות רחוקות כדאי להשתמש במשפחת מילים |
| ה | משפחה | ✓ המילים של המשפחה נכנסות כחלופות של המרכיב (כפתור "משפחות") |
| ל | שלילת המרכיב | ≈ אוצריא מסתירה תוצאות שבהן המרכיב השלול צמוד לשכניו (למשל "בני ישראל"). אפשר לשלול מרכיב אחד בלבד |
| פ | חיפוש שנשמר | ✗ מוצג אבל מושבת. אוצריא לא יכולה להשתמש בתוצאות של חיפוש קודם כמרכיב |
| (ריק) | ללא אפיון | ✓ מסיר את כל המאפיינים מהשדה |

≈ באוצריא המאפיינים חלים על כל הטור, כלומר על המילה ועל החלופות שלה. כשלשדות של אותו טור יש מאפיינים
שונים, נשלח האיחוד שלהם, והתוסף מציג הערה.

"עוד באוצריא" (מתחת לרשת): חלק ממילה, שגיאות כתיב, קידומות ארמיות, סיומות ארמיות, ניקוד, טעמים.
לאפשרויות אלה אין מקבילה בבר-אילן.

## מרחקים

כמו בבר-אילן: שדה ריק פירושו שהמרכיבים צמודים. המספר N פירושו שהמרכיב הבא נמצא עד N מקומות אחרי הקודם,
כלומר עד N−1 מילים ביניהם. כפתור החץ ליד כל זוג בוחר בין "בכל סדר" (↔, ברירת המחדל) ל"לפי הסדר בלבד".

| בר-אילן | באוצריא |
|---|---|
| כל הזוגות לפי הסדר | ✓ `customSpacing` לכל זוג, N−1 |
| זוג אחד בכל סדר, או כמה זוגות עם אותו N | ✓ `anyOrder` עם `distance` = N−1 |
| ↔ עם מרחקים שונים, או ערבוב של ↔ ו"לפי הסדר" | ≈ אוצריא מחילה "בכל סדר" על כל הזוגות, עם המרחק הגדול שהוזן |
| טווח מילים N | ≈ `anyOrder` עם N−1, נבדק בין זוגות סמוכים ולא כרוחב חלון אחד |
| בתוך משפט | ≈ אין גבולות משפט. נחפש עד 11 מילים ביניהם, בכל סדר |
| בתוך פסקה | ✓ `sameParagraph`. פסקה באוצריא היא שורה: הלכה, סעיף, דיבור המתחיל |
| בתוך מסמך | ≈ `sameSection`: תחת אותה כותרת (פרק, סימן) |
| מרחק מינימלי `[4:2]` | ✗ החיפוש מתחיל תמיד ממילה צמודה |

## תווים כלליים וביטוי רגולרי

`?` מחליף אות אחת, `~` מחליף אות אחת לכל היותר, `*` מחליף מספר כלשהו של אותיות, ו-`(ע/י/@)` מציין חלופות של
אותיות במקום אחד. שדה שיש בו תווים כאלה הופך את השאילתה כולה לביטוי רגולרי `/…/`. ב"חיפוש מתקדם" אפשר גם
להקליד ביטוי רגולרי ישיר בין לוכסנים, למשל `/שב[א-ת]ת/`.

* **הדרך הראשית: תוצאות בתוך התוסף.** `search.query` מוחק את תווי הביטוי, ולכן התוסף מריץ את הביטוי דרך
  `search.fullText`, שמעביר את השאילתה למנוע בלי שינוי.
  > ⚠️ **זה ממשק לא מתועד.** לפי ניתוח הקוד של אוצריא (`plugin_bridge_adapter.dart`, `search.fullText`) הביטוי
  > מגיע למנוע כמו שהוא, אבל זה לא כתוב בתיעוד של ה-SDK, ולא נבדק כאן בהרצה אמיתית. גרסה עתידית של אוצריא
  > יכולה לחסום את זה.
* מגבלות הדרך הזאת: עד 3000 תוצאות (`HIT_LIMIT`), אין זרימה, אין עצירה, אין מיון ואין ספירה מהמנוע. הביטוי
  יכול להיות עד 300 תווים, ויש פסק זמן של כ-30 שניות. **בחירת המאגרים מסוננת בתוסף אחרי החיפוש**, לפי שם הספר
  בעץ הספרייה. לכן ספר בשם כפול עלול להיספר בקטגוריה הלא נכונה, ותקופות לא מסוננות בכלל. "תוצאות לפי ספרים",
  הסינון והדפדוף פועלים על התוצאות שחזרו.
* **גיבוי:** אם הקריאה נכשלת (אין הרשאה, השיטה חסומה, פסק זמן, ביטוי ארוך מדי), אותו ביטוי עם המאגרים נפתח
  **בחיפוש של אוצריא** (`reader.openSearchTab`), ומופיעה הודעה.
* בביטוי עצמו מתורגמים רק המאפיינים ק, ס, ד, מ, ושאר המאפיינים לא חלים. אי אפשר לשלב תווים כלליים עם שלילה.

## תוצאות

* התוצאות מוצגות בתוך התוסף, ממוינות לפי סדר הספרייה, רלוונטיות או סדר הדורות. אפשר לבחור 50 עד 500 תוצאות בעמוד.
* "תוצאות לפי ספרים" נבנית מכל התוצאות (`includeBookCounts`) ולא רק מהעמוד הנוכחי. לחיצה על ספר או על קטגוריה מסננת אליהם.
* לחיצה על תוצאה פותחת את הספר במקום ההתאמה. Shift+Enter, או הכפתור השני, פותח את הספר לצד הספר הפתוח.
* Esc עוצר חיפוש שרץ. "פתח בחיפוש של אוצריא" פותח את אותה שאילתה במסך החיפוש של אוצריא.

## נשמר בתוסף

שאילתות קודמות (200), חיפושים שמורים (100), משפחות מילים, קבוצות מאגרים, בחירת המאגרים, המיון וגודל העמוד.
כל אלה נשמרים באחסון הפרטי של התוסף (`storage.*`) ונמחקים כשמסירים את התוסף. חיפוש שמור שומר את ההגדרות ולא
את רשימת התוצאות, ו"הצג תוצאות" מריץ אותו מחדש. מצב הטופס והתוצאות נשמר גם כשאוצריא מפנה את הלשונית מהזיכרון
(`plugin.setRestoreState`).

## לא נתמך באוצריא

ניסוח חופשי, `{{ביטוי}}` של כמה מילים כחלופה אחת, חיפוש שנשמר (פ) כמרכיב, חלון ניהול הצורות, קבוצות ניקוד
(A/E/I/O/U) ותנאי דגש, ובחירת מאגרים ברמת פרק או פסקה. הפקדים האלה מופיעים במקומם כמו בבר-אילן, מושבתים
או מסומנים ב-≈, ובחלון העצה שלהם כתוב למה.

---

## Developer notes (English / Deutsch)

**Layout**

```
plugin/            only this folder is packed into the .otzplugin
  manifest.json, index.html, css/app.css
  js/core/         pure functions, no DOM (UMD; loaded in the WebView and by node --test)
    model.js       TableQuery model, Bar-Ilan property letters, normalisation
    syntax.js      Bar-Ilan advanced syntax <-> TableQuery
    compile.js     TableQuery -> search.query params / reader.openSearchTab request + warnings
    regex.js       wildcards -> /…/ for the native search tab
    forms.js       חיפוש קל / מתקדם -> TableQuery
  js/*.js          host wrapper, theme, storage, streaming session, library tree
  js/ui/*.js       views and dialogs
  js/app.js        state, wiring, search flow, restore
tests/             node --test (reference examples, parser, validation)
tools/serve.mjs    dev server that injects tools/mock/otzaria-mock.js (mock host)
research/          git-ignored: Bar-Ilan material, screenshots (never committed or packed)
```

**Commands**

```powershell
node --test tests/                 # unit tests (model, syntax, compiler, forms)
node tools/serve.mjs               # http://localhost:5178/?theme=dark  (mock host; &fail=search or &fail=fulltext simulate errors)
otzaria pack-plugin plugin -o dist/bar-ilan-table-search-2.0.1.otzplugin --force
# without an installed Otzaria: <otzaria repo>\build\windows\x64\runner\Release\otzaria.exe pack-plugin …
```

**Design decisions / Hinweise**

* Distances use Bar-Ilan counting in the UI; the compiler subtracts 1 (Otzaria counts words in between).
  `anyOrder` is never sent together with `customSpacing` or a `proximityScope` (Otzaria rejects that).
* Word options go to `options` when every column has the same set, otherwise to `wordOptions` keyed
  `"{word}_{index}"` with the normalised word (״→", ׳→').
* Engine path: `searchTarget()` in `js/app.js` is the only switch (`'plugin'` = streamed `search.query`,
  `'regex'` = `runRegex()`). `runRegex()` delegates to `runRegexSearch()` in `js/regex-search.js`, which uses
  the **undocumented** `search.fullText` regex pass-through. When that throws `RegexSearchUnavailable`, the app
  opens the same `/…/` in Otzaria's search tab. `compile()` prepares `params` and `tab` for every regex query, so
  moving to another path (for example a future `search.query` that accepts regexes) changes only these
  functions.
* Streaming: the loop only buffers chunks. Rendering happens in `requestAnimationFrame`, and cancelling calls
  `iterator.return()` (`js/session.js`).
* Colours, fonts and sizes come only from `plugin.boot` / `theme.changed`. The `:root` hex values are defaults.
  The CSS has no shadows, uses radius 8, `em` sizes and logical properties, and `pack-plugin` reports
  "העיצוב תואם לתיעוד".
* Icons inside the page are inline SVG drawn for this plugin. The tab icon `document_table_search_24_regular` is
  in Otzaria's Fluent resolver map (`lib/plugins/utils/fluent_icon_resolver.dart`).
* Nicht geprüft: echter Lauf in Otzaria (nur Mock-Host im Browser), die Regex-Durchreichung von search.fullText zur Laufzeit, Verhalten der Engine bei
  `negativeCustomSpacing`/`negativeDistance` zusammen mit `anyOrder`, Regex-Ausführung im nativen Tab.
