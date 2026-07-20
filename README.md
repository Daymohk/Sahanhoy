# Саханхой — родословная / Sahanhoy lineage

An interactive map of a patrilineal descent chart: 267 people across 13 generations,
transcribed from the chart compiled by **Гадамаури Яраги Дазиевич**, material gathered
from 1965 onward.

Everything is static — HTML, CSS, one JavaScript file and one JSON file. No build step,
no server, no dependencies. It runs on GitHub Pages as-is.

---

## Put it online (about ten minutes)

1. **Create the repository.** On GitHub: *New repository* → name it `sahanhoy-tree` →
   Public → Create.

2. **Upload these files**, keeping the folder structure:

   ```
   index.html
   styles.css
   app.js
   config.js
   .nojekyll
   data/people.json
   photos/
   .github/ISSUE_TEMPLATE/change-request.yml
   ```

   Keep `.nojekyll` — without it GitHub ignores folders whose names start with a dot.

3. **Turn on Pages.** *Settings* → *Pages* → Source: **Deploy from a branch** →
   Branch `main`, folder `/ (root)` → Save.

4. Wait a minute or two. The site appears at
   `https://YOUR-USERNAME.github.io/sahanhoy-tree/`.

5. **Point the site at your repository.** In `config.js`, set
   `github: { owner: 'YOUR-GITHUB-USERNAME', repo: 'sahanhoy-tree' }`.
   That is what makes the *Open as GitHub issue* button work.

### Running it on your own machine

`fetch` is blocked on `file://` URLs, so double-clicking `index.html` shows an error.
Start a tiny server instead:

```bash
cd sahanhoy-tree
python3 -m http.server 8000
# then open http://localhost:8000
```

### `preview.html` — the whole site in one file

The same application with the stylesheet, code and all 267 people baked in. No server, no
internet: double-click and it opens. Use it to look at the tree now, to email a snapshot
to a relative, or as an offline copy.

It is a **snapshot**. It does not read `data/people.json`, so it will not show later
corrections until you rebuild it with `python3 build-preview.py`.

### `CHECKLIST.md` and `checklist.csv`

The transcription written out for verification against the original chart — see
*About the transcription* below. `CHECKLIST.md` shows the whole tree as an indented
outline with a tick box per person; `checklist.csv` is the same in a spreadsheet, with a
blank `ваше_исправление` column to type corrections into.

---

## How it works

**Layout** — a topbar, a sidebar of panels on the left, and the map filling the rest.
The earliest three generations (Özd → Lom → Ghaydmr) sit twice as far apart vertically as
the rest of the chart, so the founding names of the line have room to breathe.
**The names are the chart.** There are no circles: each person is their name — Cyrillic
first, Latin under it, years under that. A coloured bar to the left of the name is the
family; a fine rule beneath it is the teip. Clicking, selecting, highlighting, editing and
connecting all happen on the name itself. Curved links join father to son.

**The sidebar folds.** The `☰` button in the topbar hides or shows the sidebar at every
size — a wider chart on desktop, out of the way on a phone.

**Moving around** — wheel zooms, dragging empty space pans, clicking a circle opens their
card, double-clicking collapses or expands their descendants, hovering shows the tags.
Press `/` to jump to the search box. Zoomed far out the labels drop away and the tree
reads as a constellation.

**Family filters are echoed onto the chart.** When one or more families are selected a
small bar appears above the tree listing them, each with an ✕ to drop it without going back
to the sidebar.

**Families can be deleted** from the sidebar: hover a family and click the ✕. You are asked
to confirm, and the family name is removed from everyone who carried it — the people
themselves stay. Like everything else it is one undo step.

**Sidebar panels fold.** Every panel heading has a chevron; click the heading to collapse
it. The state is remembered.

**Sources** can be picked from the list of sources already in use or typed in freely — the
field is a combined dropdown and text box.

**Picking a father** is a type-ahead box rather than a list of 267 names: start typing in
either script and the matches drop down, with the same typo tolerance as the main search.

**Both name fields transliterate**, first and last, in both directions, while creating and
while editing. The generated side stops updating the moment you type over it by hand.

**Search is deliberately forgiving.** Both spellings are folded to a rough phonetic
skeleton before comparison, so `yaragi`, `Яраги`, `ярагы` and `jaragi` all find the same
man, and `Ahmed` will surface `АХЬМАД`. Results are ranked, closest first.

**Choosing someone** lights their whole line — ancestors up to the apical ancestor and
every descendant below — and fades the rest. A *Clear highlight* button appears top-left.

**The sidebar legends** — Families, Teips, Tukkhums — show counts and dim a group when
clicked. The **Verification** panel isolates the two kinds of doubt in the transcription:
unverified links and spellings that need checking.

**Both scripts, or one** — the selector in the topbar switches the map between Cyrillic,
Latin, or both.

**Data actions live in Admin settings.** Export people.json, download an Excel round-trip
copy, restore a backup, or wipe local edits — all in the same panel as the passcodes.
There is no separate Data section; those buttons only matter if you are editing.

**Interface language** — the `EN`/`РУ` button switches every label, button and message
between English and Russian. It is remembered.

**Day or night** — the ☾/☀ button switches the whole palette. Also remembered.

**Fields** — the topbar *Fields* button opens a small grid where you choose, separately,
which facts appear on **hover** and which appear on the **card** you get when you select
someone. Turn off what you don't need.

**Zoom** — `+` and `−` zoom about the centre of the screen, so what you were looking at
stays where it was. *Centre on map* re-centres a person without changing the zoom. `⤢`
fits the whole tree.

**Names appear where they fit.** Every string is measured with the real font rather than
estimated from a character count. Each generation has a zoom threshold derived from the
gaps and measured widths of its own row, so a sparse ancestral generation can be labelled
almost immediately while a crowded one waits until there is room. Within a row the people
with the most descendants are placed first. Across rows, a bottom label is dropped only if
it collides with a top label's actual box, so a chain of single ancestors stacks cleanly.
The label sizes shrink toward the row gap when zoomed far out and settle to an 11px floor
close in.

**Structure stays visible even when names are hidden.** Someone with no room for a name is
still drawn as a small tick, and the connecting lines are always shown. You can read the
shape of the family at any zoom, and zooming in reveals the names row by row.

Links run from below one name to just above the next, so a highlighted line never crosses
the text.

**Names scale as you zoom.** They grow as you zoom out so the tree stays readable from a
distance, and settle back to an 11px floor as you zoom in. They vanish only once the
columns are too tight for any type at all — far further out than before. Each name carries
a halo in the page colour, so a highlighted line passes behind the text instead of
through it.

**You cannot get lost.** Panning is bounded: the centre of the screen stays over the tree,
and if a fling ends on empty space the view eases back to the nearest person.

**Undo and redo** (`Ctrl+Z` / `Ctrl+Y`, or the ↶ ↷ buttons) cover every edit, including
a whole spreadsheet import. **Versions** keeps the last 30 changes with who made them and
when; any one can be restored.

### One adaptation worth knowing

In the reference design a circle's fill came from the teip and its ring from the tukkhum.
Every person in this chart shares one teip (Саханхой) and one tukkhum (Мелхий), so that
mapping would have painted all 267 circles identically. Fill is therefore driven by
**family name**, where the data actually varies — ten families across the tree — and the
ring by teip. Both legends still work as designed, and the moment a second teip appears
in the data the rings start earning their keep.

---

## Changing how it looks

Everything visual is decided in two places, and neither needs a build step — edit, save,
reload.

**`styles.css`, the `:root` block at the top.** Every colour and typeface comes from these
tokens, so changing one changes it everywhere consistently.

```css
--bg:#1b1714;        --bg-2:#221c18;      /* page, topbar/inputs */
--panel:#241f1a;     --panel-2:#2b241e;   /* panels, raised/hover */
--border:#3c332a;                         /* every hairline */
--text:#eee3d3;      --text-dim:#a89a84;   --text-faint:#6f6353;
--accent:#c4903f;    --accent-dim:#8a6a35;
--accent2:#748067;   --danger:#b1583f;     --success:#6a8a5e;
--radius:10px;
```

**How the typefaces are used:** serif (`--font-d`) for headings and names, mono
(`--font-m`) for metadata, counts and field labels, sans (`--font-b`) for everything else.
Keep that split if you swap faces — it is what stops the interface reading as generic.

**One caveat about Spectral.** It has no Cyrillic subset, and almost every name here is
Cyrillic. The stack is therefore `'Spectral','Source Serif 4',Georgia,serif`: Latin picks
up Spectral, Cyrillic falls through to Source Serif 4, which is close in colour and
weight. If you would rather one face did all the work, delete Spectral from the stack and
from the font link — Source Serif 4 covers both scripts on its own.

**Node size and spacing** are SVG geometry, at the top of `app.js`:

```js
const SPACING_X = 120, SPACING_Y = 150, NODE_R = 24;
```

Raise `SPACING_X` if long names collide; raise `NODE_R` for bigger circles.

**Family colours** come from `config.js`, or can be set live in the sidebar when adding a
person.

### After any change, rebuild the standalone file

```bash
python3 build-preview.py
```

`index.html` and the Pages site pick up changes immediately — no rebuild needed there.

### A word on restraint

The palette is doing a specific job: warm near-monochrome grounds so the single amber
accent carries meaning. Amber means *this is the line you asked for*. The moment a second
saturated colour appears in the chrome, the highlighted lineage stops reading instantly,
which is the thing the interface is for. Family colours are the deliberate exception, and
they are muted for the same reason. If you add colour, spend it on the data, not the
furniture.

---

## Roles

| Role | Can do |
|---|---|
| Viewer | browse, search, submit suggestions |
| Moderator | the above, plus approve or reject suggestions, and delete people |
| Admin | the above, plus edit people, add them, and drag circles |

The **Contributor** role is withdrawn for now. Anyone signed in or not can still suggest a
change; anyone previously stored as a contributor falls back to viewer.

Set your name and role in the **Who are you?** panel. Moderator and Admin ask for a
passcode — defaults `mod123` and `admin123`, changeable in **Admin settings**.

Once you are signed in the interface tidies itself: the login form is replaced by a
compact *Signed in* panel, the topbar *Log in* button becomes *Sign out*, and controls a
role cannot use are not shown at all. A viewer never sees undo, versions or the data
panel; a moderator sees those but not *Add a person* or the admin settings.

**View mode / Edit mode.** Moderators and admins get a switch in the topbar. In view mode
nothing on the map can be moved or altered — you can explore without fear of nudging
something. In edit mode the handles, the add-person panel and *Realign* appear.

**Editing on the map** (edit mode only):

- **Drag** a circle to move it. Its descendants move with it.
- **Shift-click** several people, then drag any one of them to move the group.
- **↑ handle** left of a name: drag it **onto another name** to make that person the
  father. Released anywhere else it simply cancels — nothing is attached by accident.
- **Detach from father** is a button in the edit form. The person stays exactly where they
  are on the chart and can be reattached later.
- **+ handle** right of a name: creates a son directly beneath and opens his details.
- **Realign** in the topbar clears every manual position and lays the generations out
  cleanly again. It is a single undo step.

**Deleting** works for moderators and admins. If the person has sons they are re-attached
to their grandfather rather than orphaned, and the confirmation tells you so before you
commit. Like every other edit it is undoable.

### About security

Be clear-eyed about this: a static site has no server, so it cannot really keep anyone
out. The passcode gates the editing *interface*, not the data — a shared-community gate,
not a lock. What it does prevent is casual or accidental editing, which is the realistic
risk here.

**The actual protection is GitHub itself.** The published `data/people.json` only changes
when someone with write access commits it. Editing in the browser changes nothing for
anyone else. That is the security model, and it is a good one for a family archive:
everyone can propose, a named few can publish.

If you later want real accounts and live editing, that needs a backend — Supabase or
Firebase are the usual low-effort choices, and the JSON shape here would carry over.

---

## The editing workflow

```
someone spots an error
        │
        ├─ Suggest a change  ──►  Pending suggestions panel  ──►  Moderator approves ──┐
        │                                                                             │
        └─ Open as a GitHub issue  ─────────────────────────────────────►  issue ──────┤
                                                                                      ▼
                                                            an admin downloads
                                                            people.json and commits it
                                                                                      │
                                                                                      ▼
                                                            everyone sees the change
```

Concretely, as an admin:

1. Sign in as Admin, click a person, *Edit* (or *Add a son*).
2. Make the changes. Fill in one script and the other is suggested when you leave the
   field — it never overwrites anything you typed.
3. When you're done, *Admin settings* → **Download people.json**.
4. In the repository, open `data/people.json` → pencil icon → paste the new contents →
   commit. Or drag the file in via *Upload files*.

Browser edits live in `localStorage` until you do this. They are yours alone, and they
survive a reload but not a different device. The **Activity log** panel records who did
what in this browser.

### Excel

*Data* → **Export Excel** writes the whole tree as a spreadsheet, one row per person, with
`id` and `fatherId` carrying the structure. Edit it in Excel, then **Import Excel** to read
it back — rows are matched on `id`, so you can change names, dates, families or parentage
in bulk. An import is a single undo step, and lands in Versions like anything else.

If the spreadsheet library cannot be reached (no internet, or a blocked CDN) the export
falls back to CSV, which Excel opens natively. Import accepts either format.

### Dates

The map shows **years only** — `1848–1948` — because that is all that fits under a circle.
The full date appears on the person's card: `07-03-1848 – 21-11-1948`.

Dates use a fixed **DD–MM–YYYY** control: day and month are dropdowns, so 31-02 cannot be
entered, and the day clamps to the length of the month you pick. Day and month may be left
blank when only the year is known, which is true for almost everyone on this chart. Every
clock reading in the app — the activity log, versions, suggestions — is 24-hour.

### Backups

**Export backup** in the topbar produces one file with your unpublished edits, circle
positions, pending suggestions and the activity log. **Import** restores it. Do this
before any large editing session, and keep the file somewhere other than the machine you
edit on.

The published `data/people.json` in Git is itself a backup with full history — every
commit is a restorable version.

### Photos

Put image files in `photos/` and set a person's photo field to `photos/filename.jpg`.
An external URL works too. A photo fills the person's circle on the map and appears in
their card.

---

## About the transcription — please read

The original chart is a hand-annotated scan with no text layer, so the names were read
optically at 300 dpi. **Treat this as a first draft that needs a family member's eye.**

**`CHECKLIST.md` is the file to work through.** It opens with the twenty-five entries most
likely to be wrong — eight uncertain father-son links and seventeen uncertain spellings —
then gives the full tree as an indented outline you can read straight down against the
original. `checklist.csv` is the same list for a spreadsheet.

Two kinds of uncertainty are marked in the interface:

- **A dashed link** means the father-son connection could not be traced with confidence
  through the long connecting lines in the lower half of the chart. These are:
  ХАРЦИ, ЗУКР, ХИДИР, АЛБАКЪ, СУТРГ, БАХЬИГ, КУТШ, МУРТЗ. Where the chart was ambiguous I
  attached a subtree at the most plausible point rather than dropping it.
- **A red dot** on a circle flags a name read from faint, overwritten or handwritten text.

Other things worth a second look:

- The four sons of ДАЗИ (ЯРАГИ, МУХАРБЕК, РУСЛАН, ДАУД) each have a bracket to a group of
  sons. My reading of which grandson belongs to which father is inference from the bracket
  positions.
- Several names appear twice in different generations (АЛБАКЪ, ПАЙДМР, ЭЛИГ, ХЬУНАХК).
  The repeats are marked `(II)` so they stay distinguishable. That is an editorial
  addition, not something the chart says.
- The Latin spellings are a systematic transliteration of the Chechen Cyrillic
  (хь → h, къ → q, гӏ → gh, оь → ö), with conventional spellings where one exists. They
  are suggestions; override any that a family prefers to spell differently.
- Teip is recorded as Саханхой and tukkhum as Мелхий for everyone, from the chart's title
  and its reference to Мелхистинка. If sub-branches carried different affiliations, those
  fields are per-person and can be edited.

The chart's own attributions: compiler Гадамаури Яраги Дазиевич, with material gathered by
Магомадов Мухтар Махмудович (1916–2004) and Гадамаури Ташу Элиговна (1890–1981).

---

## Data format

`data/people.json` is a flat list. Descent is expressed by `father`, which holds another
person's `id` or `null` for the apical ancestor.

```json
{
  "id": "gudi-1",
  "father": "hunakhk-2",
  "nameRu": "ГУДИ",
  "nameEn": "Gudi",
  "surnameRu": "Гадамаури",
  "surnameEn": "Gadamauri",
  "teip": "Саханхой",
  "tukkhum": "Мелхий",
  "birth": "",
  "death": "1948",
  "notes": "Участник 1-й мировой войны…",
  "photo": "",
  "nameConfidence": "high",
  "linkConfidence": "chart",
  "source": "Родословная тейпа Саханхой…"
}
```

`nameConfidence` is `high`, `medium` or `low`. `linkConfidence` is `chart` (drawn on the
original), `unverified` (dashed), or `added` (entered later). Editing the JSON directly is
perfectly fine — it is plain text, and Git will show you exactly what changed.

The application keeps its own field names internally (`fatherId`, `family`, `photoUrl`),
and converts on load and on export, so the file on disk stays in the format above.

---

## If you want more later

Reasonable next steps, roughly in order of effort: a printable poster export; a timeline
view keyed on birth years; and a real backend if live multi-user editing ever becomes
worth the maintenance.

The previous slate-and-brass version of the interface is kept in `_old/` — delete that
folder if you don't want it in the repository.
