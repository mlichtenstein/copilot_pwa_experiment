/*
 * Purpose: Valley textures as a cloud simulator experiment module: sourced cloud bitmaps
 *   drift with the wind and are revealed by moving masks around hill silhouettes. The
 *   textures load asynchronously (the instance's ready promise). Its lighting is fixed in the
 *   bitmaps and the scene, so it does not follow the shared sun.
 * Consumers: valley.js (mounts it with core/host.js), core/registry.js,
 *   core/experiment.test.js, valley-ui.test.js.
 * Dependencies: valley-model.js (rendering, texture list), valley-textures.js (bitmap
 *   decoding); the page's Image and canvas APIs (through the doc it is given); the contract
 *   in core/experiment.js.
 */
import { defaults, textureOptions, renderValley } from "./valley-model.js";
import { decodeCloudTexture, makeWrappingPhoto } from "./valley-textures.js";

const BLEND = "Cloud blend", HORIZON = "Horizon";
const slider = (key, min, max, stepSize, help, extra = {}) => ({ key, kind: "range", min, max, step: stepSize, default: defaults[key], help, ...extra });
const textureChoices = textureOptions.map(option => [option.id, option.name]);
const textureFor = id => textureOptions.find(option => option.id === id) ?? textureOptions[0];
const sliderKeys = Object.keys(defaults);
const TEXTURE_HELP = "Photo = wind-driven wrapping sky; brush = varied stamps.";

// Decode one sourced bitmap into the grayscale shading + alpha texture the model draws.
async function loadTexture(option, doc) {
  const image = new globalThis.Image(); image.src = option.file; await image.decode();
  const scratch = doc.createElement("canvas"); scratch.width = 512; scratch.height = Math.max(1, Math.round(512 * (image.naturalHeight || 512) / (image.naturalWidth || 512)));
  const ctx = scratch.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0, scratch.width, scratch.height);
  const rgba = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
  let texture = decodeCloudTexture(rgba, scratch.width, scratch.height, option.profile);
  if (option.profile) texture = makeWrappingPhoto(texture);
  texture.seed = textureOptions.indexOf(option) * 101;
  return [option.id, texture];
}

// The grayscale/alpha preview of a texture on a small canvas.
function drawPreview(target, option, texture) {
  const ctx = target.getContext("2d"), image = ctx.createImageData(target.width, target.height);
  for (let y = 0; y < target.height; y++) for (let x = 0; x < target.width; x++) {
    const i = Math.floor(y / target.height * texture.height) * texture.width + Math.floor(x / target.width * texture.width), out = (y * target.width + x) * 4;
    const shade = texture.shading ? texture.shading[i] : 1 - texture.pixels[i];
    image.data[out] = image.data[out + 1] = image.data[out + 2] = shade * 255; image.data[out + 3] = texture.pixels[i] * 255;
  }
  ctx.putImageData(image, 0, 0); target.setAttribute("aria-label", option.name + " grayscale cloud mask");
}

export const valley = {
  id: "valley",
  title: "Valley textures",
  app: "cloud-simulator/valley",
  width: 192,
  height: 120,
  sun: false,
  frameInterval: 80,
  playLabels: ["Play wind", "Pause wind"],
  loadError: "Cloud textures could not load. Reload online to try again.",
  params: [
    { key: "textureA", kind: "select", label: "Cloud A", help: TEXTURE_HELP, group: BLEND, default: "rose", options: textureChoices },
    { key: "textureB", kind: "select", label: "Cloud B", help: TEXTURE_HELP, group: BLEND, default: "billow", options: textureChoices },
    slider("textureBlend", 0, 1, 0.01, "0 = Cloud A, 1 = Cloud B. Crossfades cloud opacity and opacity-weighted grayscale shading before lighting.", { group: BLEND, wide: true }),
    { key: "horizon", kind: "select", display: "radio", group: HORIZON, default: "hills", options: [["valley", "Deep valley"], ["hills", "Low rolling hills"], ["open", "Open horizon"]] },
    { key: "placement", kind: "select", label: "Cloud placement", default: "full",
      options: [["full", "Full sky"], ["spread", "Three separated heights"], ["high", "High clouds"], ["low", "Low clouds"], ["band", "Adjustable band"]] },
    { key: "shape", kind: "select", label: "Reveal shape", default: "noise",
      options: [["noise", "Two evolving Perlin fields"], ["combined", "Ribbon + pockets"], ["ribbon", "Flowing ribbon"], ["pockets", "Drifting oval"]] },
    slider("wind", -12, 12, 0.5, "Signed horizontal drift in 192-pixel reference-screen pixels/second. Positive blows right; layers drift at different rates."),
    slider("formationSpeed", 0, 1, 0.05, "Speed of the broad reveal/dissolve fields, independent of wind."),
    slider("cloudY", 0, 1, 0.01, "Band center / spread offset; 0 is sky top, 1 is bottom. Full sky ignores the band."),
    slider("bandWidth", 0.04, 1, 0.01, "Vertical reach around each cloud height. Full sky ignores this limit."),
    slider("coverage", 0, 1, 0.05, "How much of the texture the reveal field admits; 0 clears clouds, 1 removes the formation cutout."),
    slider("maskSoftness", 0.02, 0.4, 0.02, "Width of the smooth transition at the reveal-field boundary."),
    slider("windwardClearance", 0, 0.2, 0.005, "Cloud-free depth on uphill slopes facing the wind, in image-height units. Zero lets clouds hug this side."),
    slider("leewardClearance", 0, 0.2, 0.005, "Cloud-free depth on downhill slopes sheltered from wind. Wind reversal swaps sides; calm wind clears neither."),
    slider("textureScale", 0.5, 2.5, 0.1, "Brush size: larger values make smaller stamps. Photos use this as sky-strip zoom (minimum 1); wind always moves them."),
    slider("opacity", 0, 2, 0.1, "Opacity multiplier for the revealed texture."),
    slider("noiseScale", 0.5, 8, 0.5, "Spatial frequency of the two Perlin fields; larger values form smaller patches."),
    slider("noiseDrift", 0, 1, 0.05, "Opposing horizontal drift of the reveal fields, in noise cells per formation second."),
    { key: "brushSeed", kind: "seed", default: 1, hidden: true, next: value => value + 1, newLabel: "New brush layout",
      newTitle: "Choose another stable randomized brush layout; photographs stay unchanged" }
  ],
  actions: [
    { id: "step", label: "Step 1 second", title: "Pause and move the wind clock on one second", run: page => { page.setPlaying(false); page.instance.time += 1; } },
    { id: "reset", label: "Reset", title: "Pause, put the wind clock back to 0 and every control back to its default",
      run: page => { page.setPlaying(false); page.instance.time = 0; page.resetToDefaults(); } }
  ],
  stats: (params, frame, instance) =>
    `${textureFor(params.textureA).name} → ${textureFor(params.textureB).name} · ${Math.round(params.textureBlend * 100)}% B · layout ${params.brushSeed} · t ${instance.time.toFixed(1)} s · ${instance.lastMs.toFixed(0)} ms/frame`,
  // The two texture previews sit under their pickers, as before.
  decorate({ doc, controlFor }) {
    const previews = ["textureA", "textureB"].map((key, i) => {
      const target = doc.createElement("canvas");
      Object.assign(target, { id: "preview-" + "ab"[i], width: 96, height: 60 });
      target.setAttribute("role", "img");
      target.setAttribute("style", "width:100%;aspect-ratio:8/5;background:repeating-conic-gradient(#38404a 0% 25%,#56606b 0% 50%) 0 / 16px 16px");
      target.setAttribute("aria-label", `Cloud ${"AB"[i]} grayscale mask preview`);
      controlFor(key)?.append(target);
      return { key, target, shown: null };
    });
    return (params, instance) => {
      if (!instance.textures) return;
      for (const preview of previews) {
        if (preview.shown === params[preview.key]) continue;
        drawPreview(preview.target, textureFor(params[preview.key]), instance.textures[params[preview.key]]);
        preview.shown = params[preview.key];
      }
    };
  },
  create({ width, height, params, doc = globalThis.document }) {
    let current = params;
    const instance = {
      // The wind clock, in seconds: it runs while playing and is not part of the saved settings.
      time: 0, lastMs: 0, textures: null,
      ready: Promise.all(textureOptions.map(option => loadTexture(option, doc))).then(entries => { instance.textures = Object.fromEntries(entries); }),
      update(next) { current = next; },
      step(dt) { instance.time += dt; return true; },
      render() {
        if (!instance.textures) return null;
        const start = globalThis.performance?.now() ?? 0;
        const options = { ...Object.fromEntries(sliderKeys.map(key => [key, current[key]])), horizon: current.horizon, brushSeed: current.brushSeed, placement: current.placement };
        const pixels = renderValley(instance.textures[textureFor(current.textureA).id], instance.time, options, current.shape, width, height, instance.textures[textureFor(current.textureB).id]);
        instance.lastMs = (globalThis.performance?.now() ?? 0) - start;
        return pixels;
      },
      dispose() {}
    };
    return instance;
  }
};
