# Lessons Learned

Real bugs I hit while building this, and how I diagnosed/fixed them. Documenting these because the debugging process taught me more than the features themselves — and it's the kind of problem-solving I'd bring to a cloud/infrastructure role.

---

## 1. Silent data loss from partial API updates

**Symptom:** Editing a date directly on the Gantt chart for one sample build would randomly wipe the *material usage* fields on a *different* sample build that had been edited earlier.

**Root cause:** Two different code paths saved a sample build — the main "Edit" modal (which sent every field) and an inline date-editor on the Gantt chart (which only sent the date fields it cared about). The backend's `UPDATE` statement used `field=?` for *every* column regardless of what was sent, so any field not included in a particular request got overwritten with `null`/`0`.

**Fix — two layers:**
1. Fixed the inline editor to send the complete object.
2. More importantly: made the backend **read the existing row first**, and only overwrite a column if the caller actually provided a new value for it (partial-update safety net). This way, no future code path can accidentally wipe unrelated data again — even if I forget to send a field somewhere.

**Takeaway:** Don't trust every caller to send a complete payload. Build the safety into the data layer, not just the call sites.

---

## 2. `multer.diskStorage` runs before the form body is parsed

**Symptom:** File uploads kept failing with "folder not found," even when the folder definitely existed, and debug logs showed the destination path as `Project/unknown/APQP/Phase/Item`.

**Root cause:** `multer.diskStorage`'s `destination` callback executes *before* `req.body` is fully populated for multipart form data with file + fields mixed — so any logic that depended on `req.body.partPn` to compute the file's destination folder was reading `undefined`.

**Fix:** Switched to `multer.memoryStorage()` (holds the file in RAM), then manually write the buffer to disk *after* the route handler has full access to `req.body`. Trade-off: not ideal for huge files at scale, but fine for typical document uploads (<10MB).

**Takeaway:** Middleware execution order matters more than I assumed — "should be straightforward" libraries can have non-obvious internal sequencing.

---

## 3. Browsers block file pickers triggered after an `await`

**Symptom:** Clicking an "Upload" button sometimes silently did nothing — no file picker opened.

**Root cause:** I was calling an async folder-existence check (`await checkFolderExists(...)`) *before* triggering the hidden `<input type="file">` element's `.click()`. Browsers require file pickers to be triggered synchronously within a genuine user gesture (click handler) — once you `await` something, the browser no longer considers it "in response to" the click, and silently blocks the picker for security reasons.

**Fix:** Trigger `.click()` synchronously first; move any async validation into the file input's `onchange` handler instead (which still runs in a valid context).

**Takeaway:** Browser security models have non-obvious edge cases around async/user-gesture interaction — worth understanding deeply if building anything with file inputs, clipboard access, or fullscreen APIs.

---

## 4. `node:sqlite` doesn't support `db.transaction()`

**Symptom:** `TypeError: db.transaction is not a function` on a bulk-import route.

**Root cause:** I wrote the code assuming `better-sqlite3`'s API (which has a convenient `db.transaction(fn)` wrapper), but this project uses Node.js 22's *built-in* `node:sqlite` module — chosen specifically to avoid native-addon compilation (the original deployment target was a locked-down corporate laptop with no admin rights to install build tools). `node:sqlite` is a different, newer API with some gaps.

**Fix:** Manual `BEGIN` / `COMMIT` / `ROLLBACK` via `db.exec()` instead of the convenience wrapper.

**Takeaway:** Always verify exact API surface for a chosen library/runtime feature, especially for "built-in, no dependencies" modules that are still labeled experimental.

---

## 5. Auto-generated IDs colliding after data was loaded from the database

**Symptom:** Creating a new sample build sometimes generated an ID that already existed (`SB-004` collision), causing a `UNIQUE constraint failed` error.

**Root cause:** The ID counter was an in-memory variable that reset to a default value every time the page reloaded data from the database — it wasn't derived from what was actually in the database.

**Fix:** Changed ID generation to scan existing records for the highest sequence number and continue from there, rather than relying on a counter that could desync from reality.

**Takeaway:** Never trust client-side state to be the source of truth for anything that needs to be globally unique — always derive it from the actual data store, or generate it server-side.
