<!-- Purpose: How to add the emoji rating bar (saved settings, thumbnails, shareable links) to any app in this repo.
     Consumers: contributors adding the rating bar to an app; people or bots querying ratings.
     Dependencies: presets.js, presets-panel.js, presets.css; backend setup in ../../supabase/README.md. -->

# Shared modules

## Rating bar (presets)

Any app can put a small rating bar above its visualizer. The visitor types a name once (the browser remembers it), then plays with the settings and taps an emoji whenever something looks good or bad:

| Button | Rating | Meaning |
| --- | --- | --- |
| ❤️ | `love` | Love it |
| 🎨 | `beautiful` | Beautiful, like a painting |
| 🤮 | `gross` | Gross |
| ⬜ | `boring` | Boring |

Each tap saves one row: the app id, the name, the rating, every parameter from `getParams()` (including the seed and resolution), and a small thumbnail of the canvas at that moment. There is no form and no confirmation. The first tap signs the visitor in anonymously, with no account or email.

The bar also has:

- **🔗 Copy link**: copies a `?p=` link with the current settings. Opening the link restores them.
- **Recent**: a pop-over list of the last 10 ratings for this app, from anyone, each with its thumbnail. Clicking one loads its settings. Your own taps are marked "(you)".
- **About**: a pop-over next to Recent that explains, in plain words, what each emoji means, why tapping is useful (every tap saves the settings and a thumbnail, which maps which settings feel good or bad), that the name is remembered on this device, and what 🔗 Copy link does. Opening Recent or About closes the other.

There is no undo: a tap is a quick reaction, and a stray one is harmless. Rows can still be deleted in the dashboard (see [moderation](../../supabase/README.md#moderation)).

Explanations sit on the controls they explain: every button, the name field and both pop-over toggles have a short `title` tooltip, and the emoji meanings come from `RATINGS` in `presets.js` (`label` for tooltips, `meaning` for About), so they can't drift apart. See [Explanatory text](../../CODING_STANDARDS.md#explanatory-text).

Files:

- [`presets.js`](presets.js): the ratings list, the URL encoding (`?p=` holds base64url JSON), the canvas thumbnail helper, and a small Supabase REST client. It has no dependencies and no network use until the bar asks for it.
- [`presets-panel.js`](presets-panel.js): `mountPresetBar`, the drop-in bar.
- [`presets.css`](presets.css): the bar's layout.

### Add it to an app

```html
<link rel="stylesheet" href="../shared/presets.css">
<!-- directly above the canvas -->
<div id="presets" role="group" aria-label="Rate these settings"></div>
```

```js
import { mountPresetBar } from "../shared/presets-panel.js";

mountPresetBar(document.getElementById("presets"), {
  app: "my-app/page",                       // one id per app or page, at most 80 characters
  getParams: () => ({ ...settings, seed }), // a plain JSON object, at most 8 KB
  applyParams: params => { /* set the controls from params, then restart */ },
  canvas: document.getElementById("sky"),   // optional; the thumbnail source
});
```

On mount, the bar applies the parameters from the page's `?p=` link, if it has any. `applyParams` gets whatever a link or a stored row holds, so ignore unknown keys and check the type of each value.

**Thumbnails.** With `canvas`, each tap downscales the canvas to fit 128×96 and stores the smaller of PNG and WebP as a data URL. That is usually 1-5 KB. The database rejects anything over 50 KB (51,200 characters) or not shaped like an image data URL. If the canvas can't be read (for example, a tainted canvas), the tap saves without a thumbnail.

**Offline and PWAs.** When the visitor is offline, the bar disables the buttons and the app keeps working. If the app is a PWA, add the three files to its service worker's precache list. Requests to Supabase are cross-origin, so let them go straight to the network rather than caching them.

### Query ratings directly

Ratings are public. A person or a bot can read them with the publishable key:

```sh
curl "https://uluovxbitpyaijrzwzyp.supabase.co/rest/v1/cloud_simulator_presets?select=display_name,rating,params,created_at&app_id=eq.cloud-simulator/convection&rating=eq.love&order=created_at.desc" \
  -H "apikey: sb_publishable_yAkIT03wv4PQHR9_vlDrog_0RmDEH64"
```

Add `thumbnail` to `select` to get the images. To open a row in its app, put its `params` into a link with `urlWithParams(pageUrl, params)` from `presets.js`.

### Tests

`node --test apps/shared/*test.js`
