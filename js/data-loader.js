/**
 * Perkbox Global Perks — Data Loader
 *
 * Fetches the Mixpanel CSV export, parses with PapaParse,
 * cleans/deduplicates/normalises into a usable dataset.
 */

(function (global) {
  'use strict';

  /* ── Category allowlist (real product categories only) ─────────── */

  var CATEGORY_ALLOWLIST = new Set([
    'Fashion & Accessories',
    'Food & Drink',
    'Travel',
    'Experiences',
    'Entertainment',
    'Health & Fitness',
    'Home & Garden',
    'Beauty & Personal Care',
    'Tech & Electronics',
    'Gifts',
    'Eating out',
    'Utilities & Services',
    'Children',
    'Sportswear',
    'Department stores',
    'Supermarkets',
    'Jewellery & accessories',
    'Motoring',
    'Alcohol',
    'Books',
    'Learning',
    'Gaming',
    'Holidays',
    'Transport',
    'Financial Services',
    'Pets',
    'Wellbeing'
  ]);

  /* ── Region name normalisation ─────────────────────────────────── */
  /* Maps CSV region names to standard names matching TopoJSON */

  var REGION_ALIASES = {
    'USA':                          'United States of America',
    'U.S.':                         'United States of America',
    'Korea':                        'South Korea',
    'British':                      null,  // discard — incomplete
    'Islamic Republic of':          null,  // discard — incomplete
    'Rest of the world':            null,  // discard — not mappable
    'Swaziland':                    'eSwatini',
    'Krygyzstan':                   'Kyrgyzstan',
    'CuraÃ§ao':                     'Curaçao',
    'Russian Federation':           'Russia',
    'Republic of North Macedonia':  'Macedonia',
    'Brunei Darussalam':            'Brunei',
    'Falkland Islands (Malvinas)':  'Falkland Is.',
    'Iran':                         'Iran',
    'Moldova':                      'Moldova',
    'Tanzania':                     'Tanzania',
    'Bolivia':                      'Bolivia',
    'Venezuela':                    'Venezuela',
    'Vietnam':                      'Vietnam',
    'Laos':                         'Laos',
    'Timor-Leste':                  'Timor-Leste',
    'Bosnia and Herzegovina':       'Bosnia and Herz.',
    'Dominican Republic':           'Dominican Rep.',
    'Christmas Island':             null,  // too small for map
    'Nauru':                        null,  // too small for map
    'Kiribati':                     null   // too small for map
  };

  /* ── Currency → country inference (for rows with empty regions) ── */

  var CURRENCY_TO_COUNTRY = {
    'GBP': 'United Kingdom',
    'USD': 'United States of America',
    'AUD': 'Australia',
    'CAD': 'Canada',
    'NZD': 'New Zealand',
    'CHF': 'Switzerland',
    'SEK': 'Sweden',
    'NOK': 'Norway',
    'DKK': 'Denmark',
    'SGD': 'Singapore',
    'HKD': 'Hong Kong',
    'JPY': 'Japan',
    'ZAR': 'South Africa',
    'BRL': 'Brazil',
    'MXN': 'Mexico',
    'INR': 'India',
    'PLN': 'Poland',
    'CZK': 'Czechia',
    'HUF': 'Hungary',
    'TRY': 'Turkey',
    'THB': 'Thailand',
    'MYR': 'Malaysia',
    'PHP': 'Philippines',
    'IDR': 'Indonesia',
    'KRW': 'South Korea',
    'AED': 'United Arab Emirates',
    'SAR': 'Saudi Arabia',
    'ILS': 'Israel',
    'TWD': 'Taiwan',
    'CLP': 'Chile',
    'COP': 'Colombia',
    'PEN': 'Peru',
    'ARS': 'Argentina'
    // EUR intentionally omitted — ambiguous (multi-country)
  };

  /* ── Parse perk type from deal_package ─────────────────────────── */

  function parsePerkType(dealPackage) {
    if (!dealPackage) return 'perk';
    var dp = dealPackage.toLowerCase();
    var hasPerk = dp.indexOf('perk') !== -1;
    var hasFlexi = dp.indexOf('flexi') !== -1 || dp.indexOf('reward') !== -1;
    if (hasPerk && hasFlexi) return 'both';
    if (hasFlexi) return 'flexi';
    return 'perk';
  }

  /* ── Split comma-separated values (respecting potential issues) ── */

  function splitCSV(str) {
    if (!str) return [];
    return str.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* ── Main loading function ─────────────────────────────────────── */

  /**
   * Fetches and parses the CSV, returns a promise of clean perk objects.
   * @param {string} url  Path to the CSV file
   * @returns {Promise<Object>} { perks: [], meta: {} }
   */
  function loadPerks(url) {
    return new Promise(function (resolve, reject) {
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
          try {
            var cleaned = cleanData(results.data);
            resolve(cleaned);
          } catch (err) {
            reject(err);
          }
        },
        error: function (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Cleans raw parsed rows into normalised perk objects.
   * @param {Array<Object>} rows  Raw PapaParse row objects
   * @returns {Object} { perks, meta }
   */
  function cleanData(rows) {
    var seenDealIds = new Set();
    var uniqueDeals = [];

    // Step 1-4: Filter rejected, empty regions, deduplicate by deal_id
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];

      // Skip rejected deals
      if (row.internal_identifier && row.internal_identifier.indexOf('REJECTED') !== -1) continue;

      // Try to infer country from currency if regions is empty
      if (!row.regions || !row.regions.trim()) {
        var currency = (row.currency || '').trim().toUpperCase();
        var inferred = CURRENCY_TO_COUNTRY[currency];
        if (inferred) {
          row.regions = inferred;
        } else {
          continue;
        }
      }

      // Deduplicate by deal_id (keep first occurrence)
      if (seenDealIds.has(row.deal_id)) continue;
      seenDealIds.add(row.deal_id);

      uniqueDeals.push(row);
    }

    // Step 5-7: Explode multi-country deals, filter categories, normalise
    var perks = [];
    for (var j = 0; j < uniqueDeals.length; j++) {
      var deal = uniqueDeals[j];
      var rawRegions = splitCSV(deal.regions);
      var rawCategories = splitCSV(deal.categories);

      // Filter to allowlisted categories only
      var cleanCategories = rawCategories.filter(function (cat) {
        return CATEGORY_ALLOWLIST.has(cat);
      });

      // Determine perk type
      var perkType = parsePerkType(deal.deal_package);

      // Explode: one perk per country
      for (var k = 0; k < rawRegions.length; k++) {
        var region = rawRegions[k];

        // Normalise region name
        if (REGION_ALIASES.hasOwnProperty(region)) {
          region = REGION_ALIASES[region];
          if (region === null) continue; // discard unmappable
        }

        perks.push({
          dealId: deal.deal_id,
          brandName: (deal.brand_name || '').trim(),
          brandId: deal.brand_id || '',
          logo: deal.logo || '',
          description: (deal.description_override || deal.description || '').trim(),
          country: region,
          categories: cleanCategories,
          perkType: perkType,
          isFlexiReward: deal.is_flexi_reward === 'True',
          provider: deal.provider || '',
          redemptions: parseFloat(deal.n_redemptions) || 0
        });
      }
    }

    // Build meta
    var meta = buildMeta(perks);

    return { perks: perks, meta: meta };
  }

  /* ── Meta / aggregation functions ──────────────────────────────── */

  function buildMeta(perks) {
    var countryCounts = {};
    var categorySet = new Set();
    var countrySet = new Set();
    var brandCountrySet = new Set(); // for global total (double-counts)
    var brandSet = new Set();
    var brandCountryMap = {}; // brand → Set of countries

    for (var i = 0; i < perks.length; i++) {
      var p = perks[i];
      var country = p.country;

      countryCounts[country] = (countryCounts[country] || 0) + 1;
      countrySet.add(country);
      brandSet.add(p.brandName);
      brandCountrySet.add(p.brandName + '||' + country);

      for (var j = 0; j < p.categories.length; j++) {
        categorySet.add(p.categories[j]);
      }

      if (!brandCountryMap[p.brandName]) {
        brandCountryMap[p.brandName] = new Set();
      }
      brandCountryMap[p.brandName].add(country);
    }

    // Sort categories by frequency
    var catFreq = {};
    for (var k = 0; k < perks.length; k++) {
      perks[k].categories.forEach(function (c) {
        catFreq[c] = (catFreq[c] || 0) + 1;
      });
    }
    var categories = Array.from(categorySet).sort(function (a, b) {
      return (catFreq[b] || 0) - (catFreq[a] || 0);
    });

    // Sort countries alphabetically
    var countries = Array.from(countrySet).sort();

    // Top brands: brands in most countries
    var topBrands = Object.keys(brandCountryMap)
      .filter(function (name) { return name; }) // skip empty names
      .map(function (name) {
        return {
          brandName: name,
          countries: brandCountryMap[name].size,
          logo: '',
          brandId: ''
        };
      })
      .sort(function (a, b) { return b.countries - a.countries; })
      .slice(0, 30);

    // Attach logos to top brands
    var brandLogos = {};
    for (var m = 0; m < perks.length; m++) {
      if (perks[m].logo && !brandLogos[perks[m].brandName]) {
        brandLogos[perks[m].brandName] = { logo: perks[m].logo, brandId: perks[m].brandId };
      }
    }
    topBrands.forEach(function (b) {
      if (brandLogos[b.brandName]) {
        b.logo = brandLogos[b.brandName].logo;
        b.brandId = brandLogos[b.brandName].brandId;
      }
    });

    return {
      globalTotal: perks.length, // intentionally double-counts brands across countries
      uniqueBrands: brandSet.size,
      totalCountries: countrySet.size,
      countryCounts: countryCounts,
      categories: categories,
      countries: countries,
      topBrands: topBrands
    };
  }

  /* ── Filter helper ─────────────────────────────────────────────── */

  /**
   * Filters perks by criteria.
   * @param {Array} perks     Full perk array
   * @param {Object} filters  { country, category, perkType }
   * @returns {Array} Filtered perks
   */
  function filterPerks(perks, filters) {
    return perks.filter(function (p) {
      if (filters.country && p.country !== filters.country) return false;
      if (filters.category && p.categories.indexOf(filters.category) === -1) return false;
      if (filters.perkType && filters.perkType !== 'all') {
        if (filters.perkType === 'perk' && p.perkType === 'flexi') return false;
        if (filters.perkType === 'flexi' && p.perkType === 'perk') return false;
      }
      return true;
    });
  }

  /* ── Exports ───────────────────────────────────────────────────── */

  global.DataLoader = {
    loadPerks: loadPerks,
    cleanData: cleanData,
    filterPerks: filterPerks,
    CATEGORY_ALLOWLIST: CATEGORY_ALLOWLIST,
    CURRENCY_TO_COUNTRY: CURRENCY_TO_COUNTRY,
    _parsePerkType: parsePerkType,
    _splitCSV: splitCSV
  };

}(window));
