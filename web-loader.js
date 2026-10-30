/* Scrap Surge browser launcher. The Godot engine stays unmodified; this file only
   reassembles large files that were split below the static host's per-file limit,
   keeps every download tied to one build, and sizes the canvas for phones. */
(function () {
  'use strict';
  const originalFetch = window.fetch.bind(window);
  // The page tags its scripts with a build id. Game files carry it too, so a cached older file never mixes with a new build.
  const build = (() => { try { return new URL(document.currentScript.src).searchParams.get('v') || ''; } catch (_) { return ''; } })();
  function versioned(url) {
    if (!build) return url;
    const tagged = new URL(url, location.href); tagged.searchParams.set('v', build); return tagged;
  }
  let manifestPromise;
  function manifest() {
    return manifestPromise ||= originalFetch(build ? 'asset-parts.json?v=' + build : 'asset-parts.json', {cache: 'no-cache'}).then(r => {
      if (!r.ok) throw new Error('The game download is unavailable. Please reload.');
      return r.json();
    });
  }
  window.fetch = async function (input, options) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !/\/index\.(wasm|pck)$/.test(url.pathname)) return originalFetch(input, options);
    const entry = (await manifest())[url.pathname.split('/').pop()];
    if (!entry) return originalFetch(build ? versioned(url) : input, options);
    const compressed = typeof DecompressionStream !== 'undefined' && entry.gzip_parts?.length;
    const buffers = await Promise.all((compressed ? entry.gzip_parts : entry.parts).map(async part => {
      const response = await originalFetch(versioned(new URL(part, url)), options);
      if (!response.ok) throw new Error('A game file could not be downloaded. Please reload.');
      return response.arrayBuffer();
    }));
    const blob = new Blob(buffers);
    const data = compressed ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : await blob.arrayBuffer();
    if (data.byteLength !== entry.size) throw new Error('The game download was interrupted. Please reload.');
    return new Response(data, {headers: {'Content-Type': url.pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', 'Content-Length': String(entry.size)}});
  };

  // iOS Safari zooms on double-tap and pinch even with user-scalable=no; a tapping game must never zoom.
  document.addEventListener('gesturestart', event => event.preventDefault(), {passive: false});
  document.addEventListener('dblclick', event => event.preventDefault(), {passive: false});

  window.scrapLauncher = {
    start(config, threads) {
      const canvas = document.getElementById('canvas');
      const frame = document.getElementById('frame');
      const cover = document.getElementById('cover');
      const button = document.getElementById('start');
      const message = document.getElementById('message');
      const progress = document.getElementById('progress');
      const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
      if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone) document.getElementById('install').style.display = 'block';
      function resize() {
        const bounds = frame.getBoundingClientRect();
        const height = Math.max(1, Math.floor(bounds.height));
        // Phones use the whole screen; wide screens (desktop) get a phone-shaped portrait column.
        const width = Math.max(1, Math.floor(bounds.width / height > 0.75 ? height * 0.62 : bounds.width));
        canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
        // Cap render resolution on high-DPI phones; touch coordinates still use CSS pixels.
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      }
      new ResizeObserver(resize).observe(frame);
      window.addEventListener('orientationchange', () => setTimeout(resize, 250));
      resize();
      const missing = Engine.getMissingFeatures({threads});
      if (missing.length) { message.textContent = 'This browser needs ' + missing.join(', ') + '. Try an updated Safari.'; button.hidden = true; return; }
      const engine = new Engine({...config, canvas, canvasResizePolicy: 0});
      let launched = false;
      button.onclick = async () => {
        if (launched) return;
        launched = true; button.disabled = true; button.textContent = 'LAUNCHING…';
        // Hold the game upright where the browser allows it (Android, home-screen apps);
        // elsewhere the #rotate cover asks for it.
        try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}); } catch (error) {}
        message.textContent = 'Charging the jump drive. The first download takes a moment.';
        progress.hidden = false;
        try {
          await engine.startGame({onProgress(current, total) {
            if (total > 0) { progress.max = total; progress.value = current; }
            else progress.removeAttribute('value');
          }});
          cover.hidden = true; canvas.focus(); resize();
        } catch (error) {
          console.error(error); message.textContent = 'Launch failed. Check your connection and reload.';
          button.disabled = false; button.textContent = 'RELOAD'; button.onclick = () => location.reload(); progress.hidden = true;
        }
      };
    }
  };
}());
