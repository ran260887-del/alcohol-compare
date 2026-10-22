# משווה מחירי אלכוהול

כותבים שם של בקבוק, למשל "ייגרמייסטר ליטר", והאתר בודק במקביל את בנא משקאות, היבואן, משקאות הטורקי, אליאסי, בית היין ודרך היין ומסדר מהזול ליקר.

## איך זה עובד

- `public/index.html`: הדף שהמשתמש רואה.
- `netlify/functions/search.mjs`: הכתובת `/api/search?q=...` שרצה בשרת של Netlify.
- `netlify/lib/stores.mjs`: החיבור לכל חנות:
  - בנא, הטורקי, בית היין ודרך היין דרך ה-API הציבורי של WooCommerce.
  - היבואן דרך GraphQL של Magento.
  - אליאסי מתוך דף החיפוש שלהם.
- `netlify/lib/match.mjs`: ההתאמה החכמה:
  - ייגר/יגר, וו/ו, אותיות סופיות.
  - ליטר = 1L = 1000 מ"ל = 100cl.
  - עברית ואנגלית לכ-60 מותגים.
  - הבחנה בין גודל אחר (התאמה חלקית) לגרסה אחרת כמו מניפסט או 18 שנה.

אותו חיפוש נשמר בזיכרון של Netlify לחצי שעה, כך שחיפוש חוזר מקבל תשובה מיידית.

## העלאה ל-Netlify

שימו לב: גרירת התיקייה ל-Netlify Drop מעלה רק את הדף, בלי השרת, ואז החיפוש לא יעבוד. צריך להעלות באחת משתי הדרכים האלה.

### דרך 1: GitHub (מומלץ, מתעדכן לבד)

1. פתחו מאגר חדש ב-GitHub והעלו אליו את כל התיקייה.
2. ב-Netlify: **Add new site → Import an existing project → GitHub**, ובחרו את המאגר.
3. השאירו את Build command ריק. ה-Publish directory יילקח מהקובץ `netlify.toml`.
4. לחצו **Deploy**.

### דרך 2: מהמחשב, עם Netlify CLI

נדרש Node.js 18 ומעלה.

```bash
npm install -g netlify-cli
cd alcohol-compare
netlify login
netlify deploy --prod
```

בפעם הראשונה בחרו **Create & configure a new project**. בשאלה על Publish directory כתבו `public`.

## בדיקה

```bash
npm test                              # בדיקות ההתאמה על נתונים שמורים
npm run try -- "ייגרמייסטר ליטר"      # חיפוש אמיתי מהמחשב שלכם, בלי Netlify
```

אחרי ההעלאה אפשר לבדוק ישירות: `https://<האתר-שלכם>.netlify.app/api/search?q=ייגרמייסטר ליטר`

## אם חנות מראה "האתר לא ענה"

- ייתכן שהחנות חוסמת בקשות מהשרתים של Netlify, או שהאתר שלה איטי באותו רגע.
- בדקו בכתובת `/api/search`: בשדה `stores` יש `error` לכל חנות שנכשלה.
- משקאות הטורקי ודרך היין לא נבדקו מול השרת שלהם לפני ההעלאה. אם אחת מהן נכשלת, שלחו את הודעת השגיאה ונתאים את החיבור.

## הוספת חנות

מוסיפים שורה ל-`STORES` בקובץ `netlify/lib/stores.mjs`. אם החנות בנויה על WordPress ו-WooCommerce, מספיק `search: woo("https://כתובת-החנות")`. מוסיפים אותה גם לרשימה `STORES` בקובץ `public/index.html`.

## היבואן דרך גוגל (אופציונלי)

היבואן חוסם בקשות משרתים (Cloudflare). אם מגדירים מפתח של Google Custom Search, האתר לוקח את המחירים של היבואן מהאינדקס של גוגל ומסמן אותם "לפי גוגל". המחירים האלה יכולים להיות בפיגור של כמה ימים.

1. ב-programmablesearchengine.google.com יוצרים מנוע חיפוש חדש, בוחרים "Search specific sites" ומזינים `the-importer.co.il/*`. מעתיקים את ה-**Search engine ID**.
2. ב-console.cloud.google.com מפעילים את **Custom Search API**, ואז ב-Credentials יוצרים **API key**.
3. ב-Netlify נכנסים ל-**Site configuration → Environment variables** ומוסיפים שני משתנים: `GOOGLE_API_KEY` עם המפתח ו-`GOOGLE_CX` עם ה-Search engine ID.
4. ב-**Deploys** לוחצים **Trigger deploy**.

עד 100 חיפושים ביום בחינם. כל חיפוש משתמש בשאילתה אחת לכל היותר, וחיפוש חוזר נשמר לחצי שעה.
