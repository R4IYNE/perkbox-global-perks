/**
 * Tests for DataLoader — CSV cleaning pipeline
 *
 * @jest-environment jsdom
 */

/* ── Helpers: simulate the IIFE globals ──────────────────────────── */

// Load data-loader.js into the jsdom window
const fs = require('fs');
const path = require('path');

const dataLoaderCode = fs.readFileSync(
  path.resolve(__dirname, '../js/data-loader.js'),
  'utf-8'
);

// Execute in jsdom context
eval(dataLoaderCode);

const { cleanData, filterPerks, _parsePerkType, _splitCSV, CATEGORY_ALLOWLIST, CURRENCY_TO_COUNTRY } =
  window.DataLoader;

/* ── Test data ───────────────────────────────────────────────────── */

function makeRow(overrides) {
  return Object.assign(
    {
      uniq_id: 'uid-1',
      deal_id: 'deal-1',
      internal_identifier: 'some_deal',
      brand_name: 'TestBrand',
      logo: 'https://example.com/logo.png',
      description: 'Test perk',
      description_override: '',
      locale: 'en-GB',
      currency: 'GBP',
      sale_price: '10',
      categories: 'Food & Drink',
      regions: 'United Kingdom',
      perks_type: 'Food & Drink',
      is_flexi_reward: 'False',
      provider: 'STOCK',
      brand_id: 'brand-1',
      n_redemptions: '42',
      is_discount: 'True',
      is_flexi_perk: 'False',
      is_perk: 'True',
      deal_package: 'Perks'
    },
    overrides
  );
}

/* ── _splitCSV ───────────────────────────────────────────────────── */

describe('_splitCSV', () => {
  test('splits comma-separated values', () => {
    expect(_splitCSV('Food & Drink, Travel, Entertainment')).toEqual([
      'Food & Drink',
      'Travel',
      'Entertainment'
    ]);
  });

  test('returns empty array for empty string', () => {
    expect(_splitCSV('')).toEqual([]);
  });

  test('returns empty array for null/undefined', () => {
    expect(_splitCSV(null)).toEqual([]);
    expect(_splitCSV(undefined)).toEqual([]);
  });

  test('trims whitespace', () => {
    expect(_splitCSV('  Travel ,  Food & Drink  ')).toEqual([
      'Travel',
      'Food & Drink'
    ]);
  });
});

/* ── _parsePerkType ──────────────────────────────────────────────── */

describe('_parsePerkType', () => {
  test('returns "perk" for Perks', () => {
    expect(_parsePerkType('Perks')).toBe('perk');
  });

  test('returns "flexi" for Flexi Rewards', () => {
    expect(_parsePerkType('Flexi Rewards')).toBe('flexi');
  });

  test('returns "both" for combined', () => {
    expect(_parsePerkType('Flexi Rewards, Perks')).toBe('both');
  });

  test('returns "perk" for empty/null', () => {
    expect(_parsePerkType('')).toBe('perk');
    expect(_parsePerkType(null)).toBe('perk');
  });

  test('handles "Flexi Rewards," (trailing comma)', () => {
    expect(_parsePerkType('Flexi Rewards,')).toBe('flexi');
  });

  test('handles "Rewards" alone as flexi', () => {
    expect(_parsePerkType('Rewards')).toBe('flexi');
  });
});

/* ── cleanData ───────────────────────────────────────────────────── */

describe('cleanData', () => {
  test('filters out REJECTED deals', () => {
    const rows = [
      makeRow({ deal_id: 'd1', internal_identifier: 'normal_deal' }),
      makeRow({ deal_id: 'd2', internal_identifier: 'xxbrand REJECTED' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(1);
    expect(perks[0].dealId).toBe('d1');
  });

  test('filters out rows with empty regions (and no inferrable currency)', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: 'United Kingdom' }),
      makeRow({ deal_id: 'd2', regions: '', currency: 'EUR' }),
      makeRow({ deal_id: 'd3', regions: '   ', currency: '' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(1);
  });

  test('deduplicates by deal_id (keeps first)', () => {
    const rows = [
      makeRow({ deal_id: 'd1', sale_price: '10', brand_name: 'Brand A' }),
      makeRow({ deal_id: 'd1', sale_price: '25', brand_name: 'Brand A' }),
      makeRow({ deal_id: 'd1', sale_price: '50', brand_name: 'Brand A' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(1);
    expect(perks[0].brandName).toBe('Brand A');
  });

  test('explodes multi-country deals into separate perks', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: 'United Kingdom, France, Germany' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(3);
    expect(perks.map(p => p.country).sort()).toEqual([
      'France',
      'Germany',
      'United Kingdom'
    ]);
  });

  test('filters categories to allowlist only', () => {
    const rows = [
      makeRow({
        deal_id: 'd1',
        categories: 'Food & Drink, Homepage Hero AU, Push_notification_monday_tag_UK, Travel'
      })
    ];
    const { perks } = cleanData(rows);
    expect(perks[0].categories).toEqual(['Food & Drink', 'Travel']);
  });

  test('normalises region aliases', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: 'USA' }),
      makeRow({ deal_id: 'd2', regions: 'Russian Federation' })
    ];
    const { perks } = cleanData(rows);
    expect(perks[0].country).toBe('United States of America');
    expect(perks[1].country).toBe('Russia');
  });

  test('discards unmappable regions (Rest of the world, British, etc.)', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: 'Rest of the world' }),
      makeRow({ deal_id: 'd2', regions: 'British' }),
      makeRow({ deal_id: 'd3', regions: 'United Kingdom' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(1);
    expect(perks[0].country).toBe('United Kingdom');
  });

  test('discards tiny islands', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: 'Christmas Island' }),
      makeRow({ deal_id: 'd2', regions: 'Nauru' }),
      makeRow({ deal_id: 'd3', regions: 'Kiribati' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(0);
  });

  test('uses description_override when available', () => {
    const rows = [
      makeRow({
        deal_id: 'd1',
        description: 'Original',
        description_override: 'Override text'
      })
    ];
    const { perks } = cleanData(rows);
    expect(perks[0].description).toBe('Override text');
  });

  test('parses perkType from deal_package', () => {
    const rows = [
      makeRow({ deal_id: 'd1', deal_package: 'Perks' }),
      makeRow({ deal_id: 'd2', deal_package: 'Flexi Rewards' }),
      makeRow({ deal_id: 'd3', deal_package: 'Flexi Rewards, Perks' })
    ];
    const { perks } = cleanData(rows);
    expect(perks[0].perkType).toBe('perk');
    expect(perks[1].perkType).toBe('flexi');
    expect(perks[2].perkType).toBe('both');
  });
});

/* ── Meta / aggregation ──────────────────────────────────────────── */

describe('cleanData meta', () => {
  test('globalTotal double-counts brands across countries', () => {
    const rows = [
      makeRow({ deal_id: 'd1', brand_name: 'ASOS', regions: 'United Kingdom' }),
      makeRow({ deal_id: 'd2', brand_name: 'ASOS', regions: 'France' }),
      makeRow({ deal_id: 'd3', brand_name: 'Nike', regions: 'United Kingdom' })
    ];
    const { meta } = cleanData(rows);
    // ASOS in UK + ASOS in France + Nike in UK = 3
    expect(meta.globalTotal).toBe(3);
  });

  test('uniqueBrands counts distinct brand names', () => {
    const rows = [
      makeRow({ deal_id: 'd1', brand_name: 'ASOS', regions: 'United Kingdom' }),
      makeRow({ deal_id: 'd2', brand_name: 'ASOS', regions: 'France' }),
      makeRow({ deal_id: 'd3', brand_name: 'Nike', regions: 'United Kingdom' })
    ];
    const { meta } = cleanData(rows);
    expect(meta.uniqueBrands).toBe(2);
  });

  test('countryCounts tallies perks per country', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: 'United Kingdom' }),
      makeRow({ deal_id: 'd2', regions: 'United Kingdom' }),
      makeRow({ deal_id: 'd3', regions: 'France' })
    ];
    const { meta } = cleanData(rows);
    expect(meta.countryCounts['United Kingdom']).toBe(2);
    expect(meta.countryCounts['France']).toBe(1);
  });

  test('topBrands sorted by country coverage', () => {
    const rows = [
      makeRow({ deal_id: 'd1', brand_name: 'Global Brand', regions: 'United Kingdom, France, Germany' }),
      makeRow({ deal_id: 'd2', brand_name: 'Local Brand', regions: 'France' })
    ];
    const { meta } = cleanData(rows);
    expect(meta.topBrands[0].brandName).toBe('Global Brand');
    expect(meta.topBrands[0].countries).toBe(3);
  });
});

/* ── filterPerks ─────────────────────────────────────────────────── */

describe('filterPerks', () => {
  const testPerks = [
    { country: 'United Kingdom', categories: ['Food & Drink'], perkType: 'perk' },
    { country: 'United Kingdom', categories: ['Travel'], perkType: 'flexi' },
    { country: 'France', categories: ['Food & Drink'], perkType: 'both' },
    { country: 'Germany', categories: ['Tech & Electronics'], perkType: 'perk' }
  ];

  test('filters by country', () => {
    const result = filterPerks(testPerks, { country: 'United Kingdom' });
    expect(result).toHaveLength(2);
  });

  test('filters by category', () => {
    const result = filterPerks(testPerks, { category: 'Food & Drink' });
    expect(result).toHaveLength(2);
  });

  test('AND-combines country and category', () => {
    const result = filterPerks(testPerks, {
      country: 'United Kingdom',
      category: 'Food & Drink'
    });
    expect(result).toHaveLength(1);
  });

  test('filters by perkType: perk', () => {
    const result = filterPerks(testPerks, { perkType: 'perk' });
    // perk + both = 3 (perk-only excludes flexi)
    expect(result).toHaveLength(3);
  });

  test('filters by perkType: flexi', () => {
    const result = filterPerks(testPerks, { perkType: 'flexi' });
    // flexi + both = 2
    expect(result).toHaveLength(2);
  });

  test('perkType "all" returns everything', () => {
    const result = filterPerks(testPerks, { perkType: 'all' });
    expect(result).toHaveLength(4);
  });

  test('empty filters return all perks', () => {
    const result = filterPerks(testPerks, {});
    expect(result).toHaveLength(4);
  });
});

/* ── Currency-to-country inference ───────────────────────────── */

describe('currency-to-country inference', () => {
  test('infers country from GBP when regions is empty', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: '', currency: 'GBP' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(1);
    expect(perks[0].country).toBe('United Kingdom');
  });

  test('infers country from USD when regions is whitespace', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: '   ', currency: 'USD' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(1);
    expect(perks[0].country).toBe('United States of America');
  });

  test('skips row when regions is empty and currency is EUR (ambiguous)', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: '', currency: 'EUR' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(0);
  });

  test('skips row when regions and currency are both empty', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: '', currency: '' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(0);
  });

  test('uses regions when present, ignoring currency', () => {
    const rows = [
      makeRow({ deal_id: 'd1', regions: 'France', currency: 'GBP' })
    ];
    const { perks } = cleanData(rows);
    expect(perks).toHaveLength(1);
    expect(perks[0].country).toBe('France');
  });

  test('CURRENCY_TO_COUNTRY map contains expected entries', () => {
    expect(CURRENCY_TO_COUNTRY['GBP']).toBe('United Kingdom');
    expect(CURRENCY_TO_COUNTRY['AUD']).toBe('Australia');
    expect(CURRENCY_TO_COUNTRY['JPY']).toBe('Japan');
    expect(CURRENCY_TO_COUNTRY['EUR']).toBeUndefined();
  });
});
