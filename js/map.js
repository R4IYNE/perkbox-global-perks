/**
 * Perkbox Global Perks — Interactive Choropleth World Map
 *
 * D3 v7 + TopoJSON world map rendered into a container selector.
 * Countries are filled with a colour gradient based on perk count.
 * Click or dropdown to select a country.
 *
 * Dependencies (must be loaded before this script):
 *   - d3 v7 (CDN)
 *   - topojson-client v3 (CDN)
 *   - data/country-coords.json (fetched internally for name aliases)
 */

(function (global) {
  'use strict';

  /* ── Constants ───────────────────────────────────────────────── */

  var TOPOJSON_URL  = 'data/world-110m.json';
  var COORDS_URL    = 'data/country-coords.json';

  var COLOR_LAND        = '#F1F5FA';
  var COLOR_BORDER      = '#d1d9e8';
  var COLOR_OCEAN       = '#F1F5FA';
  var COLOR_SELECTED    = '#4462c9';   /* --color-primary */
  var COLOR_HOVER_STROKE = '#4462c9';
  var COLOR_RANGE_LOW   = '#e8e0f0';   /* light lavender */
  var COLOR_RANGE_HIGH  = '#03072d';   /* dark navy */

  var RESIZE_DELAY = 250;

  /* ── Module state ────────────────────────────────────────────── */

  var _containerSelector = null;
  var _countryCounts     = {};
  var _topoData          = null;
  var _aliasMap          = {};
  var _svg               = null;
  var _tooltip           = null;
  var _resizeTimer       = null;
  var _highlightedName   = null;
  var _countrySelect     = null;

  /* ── Alias resolution ────────────────────────────────────────── */

  function buildAliasMap(csvNameToTopoName) {
    _aliasMap = csvNameToTopoName || {};
  }

  function resolveTopoName(name) {
    if (_aliasMap.hasOwnProperty(name)) {
      return _aliasMap[name];
    }
    return name;
  }

  /* ── Tooltip ─────────────────────────────────────────────────── */

  function createTooltip(container) {
    var existing = container.querySelector('.map-tooltip');
    if (existing) existing.parentNode.removeChild(existing);

    var tip = document.createElement('div');
    tip.className = 'map-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-hidden', 'true');
    tip.style.cssText = [
      'display:none',
      'position:absolute',
      'pointer-events:none',
      'z-index:100',
      'background:#03072d',
      'color:#ffffff',
      'padding:8px 14px',
      'border-radius:8px',
      'font-family:PerkSans,system-ui,sans-serif',
      'font-size:13px',
      'line-height:1.4',
      'white-space:nowrap',
      'box-shadow:0 4px 12px rgba(3,7,45,0.25)'
    ].join(';');

    tip.innerHTML =
      '<strong class="map-tooltip__country" style="display:block;font-weight:600;"></strong>' +
      '<span class="map-tooltip__count" style="opacity:0.8;font-size:12px;"></span>';

    container.appendChild(tip);
    return tip;
  }

  function showTooltip(tip, countryName, count, x, y) {
    tip.querySelector('.map-tooltip__country').textContent = countryName;
    tip.querySelector('.map-tooltip__count').textContent =
      count + (count === 1 ? ' perk' : ' perks');
    tip.style.display = 'block';
    positionTooltip(tip, x, y);
    tip.setAttribute('aria-hidden', 'false');
  }

  function positionTooltip(tip, x, y) {
    var containerRect = tip.parentNode.getBoundingClientRect();
    var left = x + 14;
    var top  = y - 36;

    var tipW = tip.offsetWidth  || 140;
    var tipH = tip.offsetHeight || 48;
    if (left + tipW > containerRect.width)  left = x - tipW - 10;
    if (top  + tipH > containerRect.height) top  = y - tipH - 10;
    if (top  < 0) top = y + 14;

    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
  }

  function hideTooltip(tip) {
    tip.style.display = 'none';
    tip.setAttribute('aria-hidden', 'true');
  }

  /* ── Projection ──────────────────────────────────────────────── */

  function buildProjection(width, height) {
    return d3.geoNaturalEarth1()
      .scale(1)
      .translate([0, 0])
      .fitSize([width, height], { type: 'Sphere' });
  }

  /* ── Colour scale ────────────────────────────────────────────── */

  function buildColorScale(counts) {
    var values = Object.values(counts);
    if (!values.length) return function () { return COLOR_LAND; };
    var maxVal = Math.max.apply(null, values);
    return d3.scaleSequentialLog()
      .domain([1, Math.max(maxVal, 2)])
      .interpolator(d3.interpolate(COLOR_RANGE_LOW, COLOR_RANGE_HIGH))
      .clamp(true);
  }

  /* ── Feature name resolution ─────────────────────────────────── */

  function buildTopoCountMap(countryCounts) {
    var result = {};
    Object.keys(countryCounts).forEach(function (csvName) {
      var topoName = resolveTopoName(csvName);
      if (!topoName) return;
      result[topoName] = (result[topoName] || 0) + countryCounts[csvName];
    });
    return result;
  }

  /* Reverse lookup: topoName → csvName (for event dispatch) */
  function buildReverseLookup(countryCounts) {
    var result = {};
    Object.keys(countryCounts).forEach(function (csvName) {
      var topoName = resolveTopoName(csvName);
      if (topoName) result[topoName] = csvName;
    });
    return result;
  }

  /* ── Country dropdown ────────────────────────────────────────── */

  function populateDropdown(countryCounts) {
    _countrySelect = document.getElementById('map-country-select');
    if (!_countrySelect) return;

    // Clear existing options except the first "All Countries"
    while (_countrySelect.options.length > 1) {
      _countrySelect.remove(1);
    }

    var countries = Object.keys(countryCounts).sort(function (a, b) {
      return a.localeCompare(b);
    });

    countries.forEach(function (country) {
      var opt = document.createElement('option');
      opt.value = country;
      opt.textContent = country;
      _countrySelect.appendChild(opt);
    });

    _countrySelect.addEventListener('change', function () {
      var value = _countrySelect.value || null;
      if (value) {
        _highlightedName = resolveTopoName(value);
      } else {
        _highlightedName = null;
      }
      _updateHighlight();
      _dispatchCountrySelected(value);
    });
  }

  function _syncDropdown(csvName) {
    if (_countrySelect) {
      _countrySelect.value = csvName || '';
    }
  }

  /* ── Core render ─────────────────────────────────────────────── */

  function render(containerEl, topoData, countryCounts, aliasMap) {
    containerEl.innerHTML = '';

    var width  = containerEl.clientWidth  || 800;
    var height = containerEl.clientHeight || 400;

    var pos = window.getComputedStyle(containerEl).position;
    if (pos === 'static') containerEl.style.position = 'relative';

    buildAliasMap(aliasMap);

    var topoCountMap = buildTopoCountMap(countryCounts);
    var reverseLookup = buildReverseLookup(countryCounts);

    var projection = buildProjection(width, height);
    var pathGen    = d3.geoPath().projection(projection);

    var colorScale = buildColorScale(topoCountMap);

    var allCountries = topojson.feature(topoData, topoData.objects.countries);
    // Filter out Antarctica
    var countries = {
      type: allCountries.type,
      features: allCountries.features.filter(function (f) {
        return f.properties.name !== 'Antarctica';
      })
    };
    var borders   = topojson.mesh(topoData, topoData.objects.countries,
      function (a, b) { return a !== b; });

    var svg = d3.select(containerEl)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('aria-label', 'World map showing Perkbox global perks coverage')
      .attr('role', 'img')
      .style('display', 'block');

    _svg = svg;

    /* Ocean background */
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', COLOR_OCEAN);

    /* Country paths — choropleth fill */
    var countryPaths = svg.append('g')
      .attr('class', 'map-countries')
      .selectAll('path')
      .data(countries.features)
      .join('path')
      .attr('d', pathGen)
      .attr('fill', function (d) {
        var name = d.properties.name || '';
        var count = topoCountMap[name];
        return (count && count > 0) ? colorScale(count) : COLOR_LAND;
      })
      .attr('stroke', COLOR_BORDER)
      .attr('stroke-width', 0.5)
      .style('transition', 'fill 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease');

    /* Interactive countries (those with perks) */
    countryPaths
      .filter(function (d) {
        var name = d.properties.name || '';
        return topoCountMap[name] && topoCountMap[name] > 0;
      })
      .style('cursor', 'pointer')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', function (d) {
        var name = d.properties.name || '';
        var count = topoCountMap[name] || 0;
        return name + ': ' + count + (count === 1 ? ' perk' : ' perks');
      })
      .on('mouseenter', function (event, d) {
        var featureName = d.properties.name || '';
        if (_highlightedName !== featureName) {
          d3.select(this)
            .attr('stroke', COLOR_HOVER_STROKE)
            .attr('stroke-width', 1.5)
            .raise();
        }

        var count = topoCountMap[featureName] || 0;
        var csvName = reverseLookup[featureName] || featureName;
        var rect  = containerEl.getBoundingClientRect();
        var relX  = event.clientX - rect.left;
        var relY  = event.clientY - rect.top;
        showTooltip(_tooltip, csvName, count, relX, relY);
      })
      .on('mousemove', function (event) {
        var rect = containerEl.getBoundingClientRect();
        positionTooltip(_tooltip, event.clientX - rect.left, event.clientY - rect.top);
      })
      .on('mouseleave', function (event, d) {
        var featureName = d.properties.name || '';
        if (_highlightedName !== featureName) {
          var count = topoCountMap[featureName];
          d3.select(this)
            .attr('fill', (count && count > 0) ? colorScale(count) : COLOR_LAND)
            .attr('stroke', COLOR_BORDER)
            .attr('stroke-width', 0.5);
        }
        hideTooltip(_tooltip);
      })
      .on('click', function (event, d) {
        event.stopPropagation();
        var featureName = d.properties.name || '';
        var csvName = reverseLookup[featureName] || featureName;

        // Toggle: if already selected, deselect
        if (_highlightedName === featureName) {
          _highlightedName = null;
          _syncDropdown(null);
          _dispatchCountrySelected(null);
        } else {
          _highlightedName = featureName;
          _syncDropdown(csvName);
          _dispatchCountrySelected(csvName);
        }
        _updateHighlight();
      })
      .on('keydown', function (event, d) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          var featureName = d.properties.name || '';
          var csvName = reverseLookup[featureName] || featureName;
          if (_highlightedName === featureName) {
            _highlightedName = null;
            _syncDropdown(null);
            _dispatchCountrySelected(null);
          } else {
            _highlightedName = featureName;
            _syncDropdown(csvName);
            _dispatchCountrySelected(csvName);
          }
          _updateHighlight();
        }
      });

    /* Borders on top */
    svg.append('path')
      .datum(borders)
      .attr('class', 'map-borders')
      .attr('d', pathGen)
      .attr('fill', 'none')
      .attr('stroke', COLOR_BORDER)
      .attr('stroke-width', 0.5)
      .style('pointer-events', 'none');

    /* Tooltip */
    _tooltip = createTooltip(containerEl);

    /* Click on ocean/empty area to deselect */
    svg.on('click', function () {
      if (_highlightedName) {
        _highlightedName = null;
        _syncDropdown(null);
        _dispatchCountrySelected(null);
        _updateHighlight();
      }
    });

    /* Re-apply highlight if one was set */
    if (_highlightedName) {
      _updateHighlight();
    }
  }

  /* ── Event dispatch ──────────────────────────────────────────── */

  function _dispatchCountrySelected(countryName) {
    var evt = new CustomEvent('country-selected', {
      bubbles: true,
      detail: { country: countryName || '' }
    });
    var containerEl = document.querySelector(_containerSelector);
    if (containerEl) containerEl.dispatchEvent(evt);
  }

  /* ── Highlight helpers ───────────────────────────────────────── */

  function _updateHighlight() {
    if (!_svg) return;
    var topoCountMap = buildTopoCountMap(_countryCounts);
    var colorScale = buildColorScale(topoCountMap);

    _svg.select('.map-countries').selectAll('path')
      .each(function (d) {
        var featureName = d.properties.name || '';
        var count = topoCountMap[featureName];
        var node = d3.select(this);

        if (featureName === _highlightedName) {
          node
            .attr('fill', COLOR_SELECTED)
            .attr('stroke', COLOR_SELECTED)
            .attr('stroke-width', 1.5)
            .raise();
        } else {
          node
            .attr('fill', (count && count > 0) ? colorScale(count) : COLOR_LAND)
            .attr('stroke', COLOR_BORDER)
            .attr('stroke-width', 0.5);
        }
      });
  }

  /* ── Resize handler ──────────────────────────────────────────── */

  function _onResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      if (!_containerSelector || !_topoData) return;
      var containerEl = document.querySelector(_containerSelector);
      if (!containerEl) return;
      render(containerEl, _topoData, _countryCounts, _aliasMap);
    }, RESIZE_DELAY);
  }

  /* ── Data loading ────────────────────────────────────────────── */

  function loadData(callback) {
    Promise.all([
      fetch(TOPOJSON_URL).then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + TOPOJSON_URL + ': ' + r.status);
        return r.json();
      }),
      fetch(COORDS_URL).then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + COORDS_URL + ': ' + r.status);
        return r.json();
      }).catch(function () {
        console.warn('[MapComponent] country-coords.json not loaded; names will be matched as-is.');
        return { csvNameToTopoName: {} };
      })
    ]).then(function (results) {
      callback(null, results[0], results[1].csvNameToTopoName || {});
    }).catch(function (err) {
      callback(err, null, {});
    });
  }

  /* ── Public API ──────────────────────────────────────────────── */

  function init(containerSelector, countryCounts) {
    if (typeof containerSelector !== 'string' || !containerSelector) {
      console.error('[MapComponent] init() requires a non-empty container selector string.');
      return;
    }

    var containerEl = document.querySelector(containerSelector);
    if (!containerEl) {
      console.error('[MapComponent] Container not found: ' + containerSelector);
      return;
    }

    _containerSelector = containerSelector;
    _countryCounts     = countryCounts || {};

    /* Populate the country dropdown in the map section */
    populateDropdown(_countryCounts);

    loadData(function (err, topoData, aliasMap) {
      if (err) {
        console.error('[MapComponent] Data load error:', err);
        containerEl.innerHTML =
          '<p style="padding:2rem;text-align:center;color:#4A4A4A;">' +
          'Map could not be loaded.</p>';
        return;
      }

      _topoData = topoData;
      _aliasMap = aliasMap;

      render(containerEl, topoData, _countryCounts, aliasMap);

      window.removeEventListener('resize', _onResize);
      window.addEventListener('resize', _onResize);
    });
  }

  function highlightCountry(countryName) {
    if (!countryName) {
      clearHighlight();
      return;
    }
    var topoName = resolveTopoName(countryName);
    if (!topoName) return;
    _highlightedName = topoName;
    _syncDropdown(countryName);
    _updateHighlight();
  }

  function clearHighlight() {
    _highlightedName = null;
    _syncDropdown(null);
    _updateHighlight();
  }

  /* ── Export ──────────────────────────────────────────────────── */

  global.MapComponent = {
    init:             init,
    highlightCountry: highlightCountry,
    clearHighlight:   clearHighlight
  };

}(window));
