# Clinical Keys

Typing practice for Medical Assistant and Pharmacy Tech students, built from real job tasks: vitals, SOAP notes, phone messages, sig codes, prescription labels, and look-alike drug names.

## Run it
Double-click `index.html` to open it in a browser. There's nothing to install.

To share it with students, host the folder on any static host (GitHub Pages, Netlify, or a school web server) and hand out the link.

## Add or edit drills
Drills live in `js/content/ma.js` (Medical Assistant) and `js/content/rx.js` (Pharmacy Tech). Each drill has a list of passages:

```js
{ ctx: "What the student sees above the text (HTML allowed)",
  text: "Exactly what the student types. Use \n for a new line." }
```

Set `mode: "hidden"` on a drill to hide the text and reveal letters as students type them correctly, as the Sig Code Translator does.

## Scoring
- **WPM** counts only correctly typed characters.
- **Accuracy** counts every keystroke, including corrected ones.
- **Personal bests** are saved in the browser only when a run finishes with zero errors left and 95%+ accuracy.

All patients, prescriptions, and providers are fictional. For typing practice only, not clinical guidance.
