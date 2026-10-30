<!-- Purpose: How to add saved presets and shareable parameter links to any app in this repo.
     Consumers: contributors adding the Presets panel to an app; people or bots querying presets.
     Dependencies: presets.js, presets-panel.js, presets.css; backend setup in ../../supabase/README.md. -->

# Shared modules

## Presets

Any app can let visitors save its current parameters as a named preset, browse and load other people's presets, and share any state as a link. Saves are open: the first save signs the visitor in anonymously, with no account or email.

- [`presets.js`](presets.js): the URL encoding (`?p=` holds base64url JSON) and a small Supabase REST client. No dependencies and no network use until the panel asks for it.
- [`presets-panel.js`](presets-panel.js): a drop-in panel with Save (name and optional note), Copy link, and a Saved presets list. Each item has Load, plus Delete for presets saved from this browser.
- [`presets.css`](presets.css): the panel's layout.

### Add it to an app

```html
<link rel="stylesheet" href="../shared/presets.css">
<section id="presets" aria-label="Saved presets"></section>
```

```js
import { mountPresetPanel } from "../shared/presets-panel.js";

mountPresetPanel(document.getElementById("presets"), {
  app: "my-app/page",                      // one id per app or page, at most 80 characters
  getParams: () => ({ ...settings, seed }), // a plain JSON object, at most 8 KB
  applyParams: params => { /* set the controls from params, then restart */ },
  commitSha: null,                         // optional, the build's commit if the app knows it
});
```

On mount, the panel applies the parameters from the page's `?p=` link, if there are any. `applyParams` gets whatever a link or a stored preset holds, so ignore unknown keys and check the type of each value. If the app is a PWA, add the three files to its service worker's precache list. Requests to Supabase are cross-origin; let them go straight to the network rather than caching them. When the visitor is offline, the panel disables Save and the list, and the app keeps working.

### Query presets directly

Presets are public. A person or a bot can read them with the publishable key:

```sh
curl "https://uluovxbitpyaijrzwzyp.supabase.co/rest/v1/presets?app=eq.cloud-simulator/convection&order=created_at.desc" \
  -H "apikey: sb_publishable_yAkIT03wv4PQHR9_vlDrog_0RmDEH64"
```

To open a preset in its app, put its `params` into a link with `urlWithParams(pageUrl, params)` from `presets.js`.

### Tests

`node --test apps/shared/*test.js`
