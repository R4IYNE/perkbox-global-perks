/**
 * Perkbox Global Perks — Top Brands Marquee
 *
 * Renders an auto-scrolling horizontal strip of brand logos.
 * Uses two identical inner strips and requestAnimationFrame
 * for a seamless infinite loop.
 */

(function (global) {
  'use strict';

  var MAX_BRANDS = 20;
  var SCROLL_SPEED = 0.25; // px per frame (~15px/s at 60fps)

  /* ── Build a single logo element ─────────────────────────────── */

  function buildLogoEl(brand) {
    if (brand.logo) {
      var img = document.createElement('img');
      img.className = 'marquee__logo';
      img.src = brand.logo;
      img.alt = brand.brandName || '';
      img.decoding = 'async';
      img.onerror = function () {
        img.style.display = 'none';
      };
      return img;
    }

    var span = document.createElement('span');
    span.className = 'marquee__logo';
    span.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'font-size:14px',
      'font-weight:600',
      'color:#03072d',
      'white-space:nowrap',
      'opacity:0.6'
    ].join(';');
    span.textContent = brand.brandName || '';
    return span;
  }

  /* ── Build one strip of logos ───────────────────────────────── */

  function buildStrip(brands) {
    var strip = document.createElement('div');
    strip.style.cssText = 'display:flex;gap:72px;align-items:center;flex-shrink:0;padding-right:72px;';
    brands.forEach(function (brand) {
      strip.appendChild(buildLogoEl(brand));
    });
    return strip;
  }

  /* ── Public: init ────────────────────────────────────────────── */

  function init(container, topBrands) {
    if (!container) return;
    if (!topBrands || topBrands.length === 0) {
      container.style.display = 'none';
      return;
    }

    // topBrands already sorted by popularity (redemptions) from data-loader
    var brands = topBrands.slice(0, MAX_BRANDS);

    // Build track: two identical strips side by side
    var track = document.createElement('div');
    track.setAttribute('aria-hidden', 'true');
    track.style.cssText = 'display:flex;align-items:center;width:max-content;will-change:transform;';

    var stripA = buildStrip(brands);
    track.appendChild(stripA);

    var stripB = buildStrip(brands);
    stripB.setAttribute('aria-hidden', 'true');
    track.appendChild(stripB);

    container.innerHTML = '';
    container.appendChild(track);

    // Animation state
    var offset = 0;
    var paused = false;
    var stripWidth = 0;

    container.addEventListener('mouseenter', function () { paused = true; });
    container.addEventListener('mouseleave', function () { paused = false; });

    function tick() {
      if (stripWidth === 0) {
        stripWidth = stripA.offsetWidth;
      }

      if (!paused && stripWidth > 0) {
        offset -= SCROLL_SPEED;
        if (Math.abs(offset) >= stripWidth) {
          offset += stripWidth;
        }
        track.style.transform = 'translateX(' + offset + 'px)';
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  /* ── Exports ─────────────────────────────────────────────────── */

  global.Marquee = {
    init: init
  };

}(window));
