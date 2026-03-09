/**
 * Perkbox Global Perks — Stats & Counters
 *
 * Populates hero stat counters, USP section numbers,
 * and the results bar count. Uses window.animateValue
 * from animations.js for count-up effects.
 */

(function (global) {
  'use strict';

  /* ── Number formatting helpers ───────────────────────────────── */

  /**
   * Formats a number with a thousands separator and optional suffix.
   * e.g. formatStat(9500, '+') => "9,500+"
   */
  function formatStat(value, suffix) {
    var rounded = Math.round(value);
    var str = rounded.toLocaleString ? rounded.toLocaleString('en-GB') : String(rounded);
    return str + (suffix || '');
  }

  /**
   * Returns a formatter function that formats with suffix.
   */
  function makeFormatter(suffix) {
    return function (v) { return formatStat(v, suffix); };
  }

  /* ── Animate a stat element ──────────────────────────────────── */

  function animateStat(el, targetValue, suffix) {
    if (!el) return;
    if (typeof global.animateValue === 'function') {
      global.animateValue(el, 0, targetValue, 1200, makeFormatter(suffix));
    } else {
      // Fallback: set immediately
      el.textContent = formatStat(targetValue, suffix);
    }
  }

  /* ── Public: init ────────────────────────────────────────────── */

  /**
   * Reads meta data and wires up all stat displays.
   * Should be called once after DataLoader resolves.
   * @param {Object} meta  The meta object from DataLoader.loadPerks()
   */
  function init(meta) {
    if (!meta) return;

    /* — Hero stats — */
    var heroPerksEl     = document.getElementById('stat-total-perks');
    var heroBrandsEl    = document.getElementById('stat-total-brands');
    var heroCountriesEl = document.getElementById('stat-total-countries');

    // Use rounded / display-friendly targets
    animateStat(heroPerksEl,     meta.globalTotal,   '+');
    animateStat(heroBrandsEl,    meta.uniqueBrands,  '+');
    animateStat(heroCountriesEl, meta.totalCountries, '+');

  }

  /* ── Public: updateResultsCount ─────────────────────────────── */

  /**
   * Updates the results bar text after filtering.
   * @param {number} filtered  Number of perks currently shown (total in filtered set)
   * @param {number} total     Total unfiltered perk count
   */
  function updateResultsCount(filtered, total) {
    var el = document.getElementById('results-count');
    if (!el) return;

    el.textContent = filtered.toLocaleString('en-GB') + ' perks available';
  }

  /* ── Exports ─────────────────────────────────────────────────── */

  global.Stats = {
    init:               init,
    updateResultsCount: updateResultsCount
  };

}(window));
