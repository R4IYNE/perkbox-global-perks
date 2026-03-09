/**
 * Perkbox Global Perks — App Orchestrator
 *
 * Wires all modules together: loads data, initialises map/filters/tiles/marquee/stats,
 * and manages the event flow between components.
 */

(function () {
  'use strict';

  var state = {
    perks: [],
    meta: null,
    filteredPerks: [],
    currentPage: 1,
    perksPerPage: 60,
    filters: { category: null, country: null, perkType: 'all' }
  };

  /* ── Initialisation ────────────────────────────────────────────── */

  function init() {
    showLoading(true);

    DataLoader.loadPerks('data/perks.csv')
      .then(function (result) {
        state.perks = result.perks;
        state.meta = result.meta;
        state.filteredPerks = state.perks;

        initComponents();
        applyFilters();
        showLoading(false);

        // Scroll reveal after render
        if (typeof initScrollReveal === 'function') {
          initScrollReveal();
        }
        if (typeof initStickyFilterShadow === 'function') {
          initStickyFilterShadow();
        }
        if (typeof initSmoothScroll === 'function') {
          initSmoothScroll();
        }
      })
      .catch(function (err) {
        console.error('Failed to load perks data:', err);
        showError('Unable to load perks data. Please try refreshing the page.');
      });
  }

  function initComponents() {
    // Stats — hero counters and USP numbers
    if (typeof Stats !== 'undefined' && Stats.init) {
      Stats.init(state.meta);
    }

    // Marquee — top brand logos
    if (typeof Marquee !== 'undefined' && Marquee.init) {
      var marqueeEl = document.getElementById('marquee');
      if (marqueeEl) {
        Marquee.init(marqueeEl, state.meta.topBrands);
      }
    }

    // Map
    if (typeof MapComponent !== 'undefined' && MapComponent.init) {
      MapComponent.init('#map-container', state.meta.countryCounts);
    }

    // Filters
    if (typeof Filters !== 'undefined' && Filters.init) {
      var filterBar = document.getElementById('filter-bar');
      if (filterBar) {
        Filters.init(filterBar, state.meta.categories, state.meta.countries);
        Filters.onChanged(onFiltersChanged);
      }
    }

    // Tiles
    if (typeof Tiles !== 'undefined' && Tiles.init) {
      var grid = document.getElementById('perks-grid');
      if (grid) {
        Tiles.init(grid);
        Tiles.onLoadMore(onLoadMore);
      }
    }

    // Note: country-selected events from the map are handled by filters.js
    // which calls setCountry() → notify() → onFiltersChanged() in this module.
  }

  /* ── Filter logic ──────────────────────────────────────────────── */

  function onFiltersChanged(filters) {
    state.filters = filters;
    state.currentPage = 1;
    applyFilters();

    // Highlight country on map
    if (typeof MapComponent !== 'undefined') {
      if (filters.country) {
        MapComponent.highlightCountry(filters.country);
      } else {
        MapComponent.clearHighlight();
      }
    }
  }

  function applyFilters() {
    state.filteredPerks = DataLoader.filterPerks(state.perks, state.filters);

    // Dedup by dealId when viewing global (no country filter)
    if (!state.filters.country) {
      var seenDeals = {};
      state.filteredPerks = state.filteredPerks.filter(function (p) {
        if (seenDeals[p.dealId]) return false;
        seenDeals[p.dealId] = true;
        return true;
      });
    }

    // Dedup by brand name — show each brand only once (first occurrence)
    var seenBrands = {};
    state.filteredPerks = state.filteredPerks.filter(function (p) {
      var key = (p.brandName || p.description || '').toLowerCase();
      if (!key) return true;
      if (seenBrands[key]) return false;
      seenBrands[key] = true;
      return true;
    });

    // Render tiles (tiles.js handles its own slicing via page number)
    if (typeof Tiles !== 'undefined' && Tiles.render) {
      Tiles.render(state.filteredPerks, state.currentPage);
    }

    // Update results count
    if (typeof Stats !== 'undefined' && Stats.updateResultsCount) {
      Stats.updateResultsCount(state.filteredPerks.length, state.perks.length);
    }

    // Re-run scroll reveal for newly rendered tiles
    if (typeof initScrollReveal === 'function') {
      requestAnimationFrame(function () { initScrollReveal(); });
    }
  }

  function onLoadMore() {
    state.currentPage++;

    if (typeof Tiles !== 'undefined' && Tiles.render) {
      Tiles.render(state.filteredPerks, state.currentPage);
    }

    if (typeof initScrollReveal === 'function') {
      requestAnimationFrame(function () { initScrollReveal(); });
    }
  }

  /* ── UI helpers ────────────────────────────────────────────────── */

  function showLoading(show) {
    var loader = document.getElementById('loading');
    var content = document.getElementById('main-content');
    if (loader) loader.style.display = show ? 'flex' : 'none';
    if (content) content.style.display = show ? 'none' : 'block';
  }

  function showError(message) {
    showLoading(false);
    var content = document.getElementById('main-content');
    if (content) {
      content.innerHTML = '<div class="error-state"><p>' + message + '</p></div>';
      content.style.display = 'block';
    }
  }

  /* ── Boot ───────────────────────────────────────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
