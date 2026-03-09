/**
 * Perkbox Global Perks — Perk Tiles Grid
 *
 * Renders brand tiles into a CSS grid container.
 * Handles pagination (60 per page), lazy-loaded logos,
 * first-letter fallback avatars, and a "Load more" button.
 */

(function (global) {
  'use strict';

  var PAGE_SIZE = 60;

  /* ── Internal State ──────────────────────────────────────────── */

  var _gridEl      = null;   // .perks-grid element
  var _loadMoreEl  = null;   // Load more button element
  var _loadMoreCb  = null;   // Registered callback for load more
  var _wrapEl      = null;   // Outer wrapper (contains grid + load-more)

  /* ── Badge helpers ───────────────────────────────────────────── */

  var BADGE_MAP = {
    perk:  { cls: 'perk-badge--perk',  label: 'Discount' },
    flexi: { cls: 'perk-badge--flexi', label: 'Flexi Perk' }
  };

  /**
   * Returns an array of badge elements for this perk type.
   * "both" produces two separate badges.
   */
  function buildBadges(perkType) {
    if (perkType === 'both') {
      return [buildBadge('perk'), buildBadge('flexi')];
    }
    return [buildBadge(perkType)];
  }

  function buildBadge(type) {
    var def = BADGE_MAP[type] || BADGE_MAP['perk'];
    var span = document.createElement('span');
    span.className = 'perk-badge ' + def.cls;
    span.textContent = def.label;
    return span;
  }

  /* ── Colour extraction for tile backgrounds ────────────────── */

  /* Soft palette used when logo colour can't be extracted */
  var FALLBACK_COLORS = [
    '#EEF0FF', '#FFF4EC', '#ECFDF5', '#FEF3F2', '#F5F3FF',
    '#FFF8E1', '#E8F5E9', '#E3F2FD', '#FCE4EC', '#F3E5F5'
  ];

  /**
   * Extracts dominant colour from a logo image using a small canvas.
   * Returns a muted tinted background colour, or a fallback.
   */
  function extractDominantColor(img, callback) {
    try {
      var canvas = document.createElement('canvas');
      var size = 16;
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      var data = ctx.getImageData(0, 0, size, size).data;

      var r = 0, g = 0, b = 0, count = 0;
      for (var i = 0; i < data.length; i += 4) {
        var alpha = data[i + 3];
        // Skip transparent and near-white/near-black pixels
        if (alpha < 128) continue;
        var pr = data[i], pg = data[i + 1], pb = data[i + 2];
        if (pr > 240 && pg > 240 && pb > 240) continue;
        if (pr < 15 && pg < 15 && pb < 15) continue;
        r += pr; g += pg; b += pb; count++;
      }

      if (count > 0) {
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        // Create a very light tint (12% opacity blend with white)
        var tr = Math.round(r + (255 - r) * 0.88);
        var tg = Math.round(g + (255 - g) * 0.88);
        var tb = Math.round(b + (255 - b) * 0.88);
        callback('rgb(' + tr + ',' + tg + ',' + tb + ')');
      } else {
        callback(null);
      }
    } catch (e) {
      // Canvas tainted by CORS — use fallback
      callback(null);
    }
  }

  function getFallbackColor(index) {
    return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }

  /* ── Fallback avatar ─────────────────────────────────────────── */

  function buildFallback(brandName) {
    var div = document.createElement('div');
    div.className = 'perk-tile__fallback';
    div.textContent = (brandName || '?').charAt(0).toUpperCase();
    div.setAttribute('aria-hidden', 'true');
    return div;
  }

  /* ── Tile index counter for fallback colours ────────────────── */

  var _tileIndex = 0;

  /* ── Build a single tile element ─────────────────────────────── */

  function buildTile(perk) {
    var tile = document.createElement('div');
    tile.className = 'perk-tile';
    tile.setAttribute('role', 'listitem');

    var currentIndex = _tileIndex++;

    // Staggered entrance: cap at 20 tiles to avoid long waits
    var staggerDelay = Math.min(currentIndex % PAGE_SIZE, 20) * 30;
    tile.style.animationDelay = staggerDelay + 'ms';

    /* — Logo wrap — */
    var logoWrap = document.createElement('div');
    logoWrap.className = 'perk-tile__logo-wrap';
    // Apply fallback colour immediately; will be replaced by extracted colour
    logoWrap.style.backgroundColor = getFallbackColor(currentIndex);

    if (perk.logo) {
      var img = document.createElement('img');
      img.className = 'perk-tile__logo';
      img.src = perk.logo;
      img.alt = perk.brandName;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        extractDominantColor(img, function (color) {
          if (color) logoWrap.style.backgroundColor = color;
        });
      };
      img.onerror = function () {
        logoWrap.removeChild(img);
        logoWrap.appendChild(buildFallback(perk.brandName || perk.description));
      };
      logoWrap.appendChild(img);
    } else {
      logoWrap.appendChild(buildFallback(perk.brandName || perk.description));
    }

    tile.appendChild(logoWrap);

    /* — Body — */
    var body = document.createElement('div');
    body.className = 'perk-tile__body';

    var name = document.createElement('div');
    name.className = 'perk-tile__name';
    name.textContent = perk.brandName || perk.description || 'Unknown Brand';
    name.title = perk.brandName || perk.description || '';

    var category = document.createElement('div');
    category.className = 'perk-tile__category';
    category.textContent = (perk.categories && perk.categories.length > 0)
      ? perk.categories[0]
      : '';

    var badgesEl = document.createElement('div');
    badgesEl.className = 'perk-tile__badges';
    var badgeList = buildBadges(perk.perkType);
    for (var i = 0; i < badgeList.length; i++) {
      badgesEl.appendChild(badgeList[i]);
    }

    body.appendChild(name);
    body.appendChild(category);
    body.appendChild(badgesEl);

    tile.appendChild(body);

    return tile;
  }

  /* ── Load More Button ────────────────────────────────────────── */

  function getOrCreateLoadMore() {
    if (_loadMoreEl) return _loadMoreEl;

    var wrap = document.createElement('div');
    wrap.className = 'load-more-wrap hidden';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.textContent = 'Load more perks';
    btn.addEventListener('click', function () {
      if (typeof _loadMoreCb === 'function') {
        _loadMoreCb();
      }
    });

    wrap.appendChild(btn);

    // Insert after the grid
    if (_gridEl && _gridEl.parentNode) {
      _gridEl.parentNode.insertBefore(wrap, _gridEl.nextSibling);
    }

    _loadMoreEl = wrap;
    return _loadMoreEl;
  }

  /* ── Public: init ────────────────────────────────────────────── */

  /**
   * Stores reference to the grid container element.
   * @param {HTMLElement} container  The .perks-grid element
   */
  function init(container) {
    _gridEl = container;
    if (_gridEl) {
      _gridEl.setAttribute('role', 'list');
    }
  }

  /* ── Public: render ──────────────────────────────────────────── */

  /**
   * Renders perk tiles for a given page into the grid.
   * @param {Array}  perks  Full filtered perk array
   * @param {number} page   1-based page number
   */
  function render(perks, page) {
    if (!_gridEl) return;

    var currentPage = page || 1;
    var start = (currentPage - 1) * PAGE_SIZE;
    var slice = perks.slice(start, start + PAGE_SIZE);

    // Clear grid on first page; append on subsequent pages
    if (currentPage === 1) {
      _gridEl.innerHTML = '';
      _tileIndex = 0;
    }

    if (slice.length === 0 && currentPage === 1) {
      // No results
      var noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.innerHTML =
        '<div class="no-results__icon">&#x1F50D;</div>' +
        '<div class="no-results__heading">No perks found</div>' +
        '<div class="no-results__text">Try adjusting your filters to see more results.</div>';
      _gridEl.appendChild(noResults);
      showLoadMore(currentPage, 0);
      return;
    }

    // Use a DocumentFragment for performance
    var frag = document.createDocumentFragment();
    for (var i = 0; i < slice.length; i++) {
      frag.appendChild(buildTile(slice[i]));
    }
    _gridEl.appendChild(frag);

    showLoadMore(currentPage, perks.length);
  }

  /* ── Public: showLoadMore ────────────────────────────────────── */

  /**
   * Shows or hides the "Load more" button based on remaining items.
   * @param {number} currentPage
   * @param {number} totalPerks
   */
  function showLoadMore(currentPage, totalPerks) {
    var btn = getOrCreateLoadMore();
    var shown = currentPage * PAGE_SIZE;
    if (shown < totalPerks) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }

  /* ── Public: onLoadMore ──────────────────────────────────────── */

  /**
   * Registers a callback for the "Load more" button click.
   * @param {Function} callback
   */
  function onLoadMore(callback) {
    if (typeof callback === 'function') {
      _loadMoreCb = callback;
    }
  }

  /* ── Exports ─────────────────────────────────────────────────── */

  global.Tiles = {
    init:         init,
    render:       render,
    showLoadMore: showLoadMore,
    onLoadMore:   onLoadMore
  };

}(window));
