/**
 * Perkbox Global Perks — Filter System
 *
 * Manages category pills, country dropdown, and perk-type toggle.
 * Syncs filter state to / from URL search params.
 * Dispatches a 'filters-changed' event and calls registered callbacks.
 */

(function (global) {
  'use strict';

  /* ── Internal State ──────────────────────────────────────────── */

  var _state = {
    category: null,      // null = All
    country: null,       // null = All Countries
    perkType: 'all'      // 'all' | 'perk' | 'flexi'
  };

  var _callbacks = [];
  var _elements = {
    container: null,
    categoryPills: null,
    countrySelect: null,
    typePills: null
  };

  /* ── URL Param Helpers ───────────────────────────────────────── */

  function readFromURL() {
    var params = new URLSearchParams(global.location.search);
    _state.category = params.get('category') || null;
    _state.country  = params.get('country')  || null;
    _state.perkType = params.get('type')      || 'all';
  }

  function writeToURL() {
    var params = new URLSearchParams();
    if (_state.category) params.set('category', _state.category);
    if (_state.country)  params.set('country',  _state.country);
    if (_state.perkType && _state.perkType !== 'all') params.set('type', _state.perkType);

    var newSearch = params.toString();
    var newURL = global.location.pathname + (newSearch ? '?' + newSearch : '');
    global.history.replaceState(null, '', newURL);
  }

  /* ── Notify Callbacks ────────────────────────────────────────── */

  function notify() {
    var snapshot = {
      category: _state.category,
      country:  _state.country,
      perkType: _state.perkType
    };
    for (var i = 0; i < _callbacks.length; i++) {
      try { _callbacks[i](snapshot); } catch (e) { /* swallow */ }
    }
  }

  /* ── Category Pills ──────────────────────────────────────────── */

  function renderCategoryPills(container, categories) {
    var wrap = document.createElement('div');
    wrap.className = 'filter-bar__pills';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Filter by category');

    // "All" pill first
    var allCategories = ['All'].concat(categories);

    allCategories.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-pill' + (cat === 'All' && !_state.category ? ' filter-pill--active' : '');
      if (cat !== 'All' && _state.category === cat) btn.className += ' filter-pill--active';
      btn.textContent = cat;
      btn.setAttribute('data-category', cat === 'All' ? '' : cat);
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-category') || null;
        _state.category = value || null;
        updateCategoryPills(wrap);
        writeToURL();
        notify();
      });
      wrap.appendChild(btn);
    });

    container.appendChild(wrap);
    _elements.categoryPills = wrap;
  }

  function updateCategoryPills(wrap) {
    if (!wrap) return;
    var pills = wrap.querySelectorAll('.filter-pill');
    for (var i = 0; i < pills.length; i++) {
      var pill = pills[i];
      var cat = pill.getAttribute('data-category');
      var isActive = cat === '' ? !_state.category : (cat === _state.category);
      pill.classList.toggle('filter-pill--active', isActive);
    }
  }

  /* ── Reset Filters Button ────────────────────────────────────── */

  function renderResetButton(container) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-pill filter-pill--reset';
    btn.textContent = 'Reset filters';
    btn.addEventListener('click', function () {
      _state.category = null;
      _state.country = null;
      _state.perkType = 'all';
      updateCategoryPills(_elements.categoryPills);
      // Sync the map section dropdown if it exists
      var mapSelect = document.getElementById('map-country-select');
      if (mapSelect) mapSelect.value = '';
      writeToURL();
      notify();
    });
    container.appendChild(btn);
  }

  /* ── Public: init ────────────────────────────────────────────── */

  /**
   * Renders the complete filter UI into `container`.
   * @param {HTMLElement} container    The .filter-bar__controls element
   * @param {string[]}    categories   Category list from meta.categories
   * @param {string[]}    countries    Country list from meta.countries
   */
  function init(container, categories) {
    if (!container) return;
    _elements.container = container;

    // Seed state from URL
    readFromURL();

    // Build UI sections
    renderCategoryPills(container, categories);
    renderResetButton(container);

    // Listen for programmatic country selection from the map
    document.addEventListener('country-selected', function (e) {
      if (e.detail && e.detail.country !== undefined) {
        setCountry(e.detail.country);
      }
    });
  }

  /* ── Public: getActive ───────────────────────────────────────── */

  /**
   * Returns the current active filter state.
   * @returns {{ category: null|string, country: null|string, perkType: string }}
   */
  function getActive() {
    return {
      category: _state.category,
      country:  _state.country,
      perkType: _state.perkType
    };
  }

  /* ── Public: setCountry ──────────────────────────────────────── */

  /**
   * Programmatically sets the country filter (e.g. called from map click).
   * Pass null or empty string to reset to "All Countries".
   * @param {string|null} countryName
   */
  function setCountry(countryName) {
    _state.country = countryName || null;

    // Sync dropdown
    if (_elements.countrySelect) {
      _elements.countrySelect.value = _state.country || '';
    }

    writeToURL();
    notify();
  }

  /* ── Public: onChanged ───────────────────────────────────────── */

  /**
   * Registers a callback fired whenever any filter changes.
   * @param {Function} callback  fn({ category, country, perkType })
   */
  function onChanged(callback) {
    if (typeof callback === 'function') {
      _callbacks.push(callback);
    }
  }

  /* ── Exports ─────────────────────────────────────────────────── */

  global.Filters = {
    init:       init,
    getActive:  getActive,
    setCountry: setCountry,
    onChanged:  onChanged
  };

}(window));
