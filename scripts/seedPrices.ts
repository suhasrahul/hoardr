import singlestore from 'singlestore-nodejs/promise';

// Seed price_reference — "usually ~$X new" data for keeper receipts.
// Needs SINGLESTORE_* in .env. Idempotent: re-run refreshes prices.
//   node --env-file=.env scripts/seedPrices.ts

const ROWS: [brand: string, product: string, model: string, price: number, url: string][] = [
  ['Herman Miller', 'Aeron chair', 'Aeron size B', 1395, 'https://store.hermanmiller.com/office-chairs-aeron/aeron-chair/100077461.html'],
  ['Herman Miller', 'Eames lounge chair', 'Eames Lounge + Ottoman', 5995, 'https://store.hermanmiller.com/lounge-chairs-ottomans/eames-lounge-chair-and-ottoman/100114624.html'],
  ['Steelcase', 'Leap chair', 'Leap v2', 1299, 'https://store.steelcase.com/leap'],
  ['Dyson', 'V15 vacuum', 'V15 Detect', 749, 'https://www.dyson.com/vacuum-cleaners/sticks/v15'],
  ['Miele', 'Complete C3 vacuum', 'Complete C3', 799, 'https://www.mieleusa.com/c/canister-vacuum-cleaners'],
  ['Le Creuset', 'dutch oven', '5.5qt round', 460, 'https://www.lecreuset.com/round-dutch-oven'],
  ['KitchenAid', 'stand mixer', 'Artisan 5qt', 449, 'https://www.kitchenaid.com/countertop-appliances/stand-mixers.html'],
  ['Vitamix', 'blender', '5200', 479, 'https://www.vitamix.com/us/en_us/shop/5200'],
  ['Breville', 'espresso machine', 'Barista Express', 749, 'https://www.breville.com/us/en/products/espresso/bes870.html'],
  ['Sonos', 'One speaker', 'One (gen 2)', 219, 'https://www.sonos.com/en-us/shop/one'],
  ['Nikon', 'FM2 film camera', 'FM2n', 1199, 'https://www.nikonusa.com/'],
  ['Fender', 'Stratocaster guitar', 'Player Stratocaster', 849, 'https://www.fender.com/en-US/electric-guitars/stratocaster/'],
  ['Trek', 'FX 3 bike', 'FX 3 Disc', 1079, 'https://www.trekbikes.com/us/en_US/bikes/hybrid-bikes/fitness-bikes/fx/fx-3-disc/'],
  ['Apple', 'Studio Display', 'Studio Display', 1599, 'https://www.apple.com/studio-display/'],
];

const c = await singlestore.createConnection({
  host: process.env.SINGLESTORE_HOST,
  port: Number(process.env.SINGLESTORE_PORT ?? 3306),
  user: process.env.SINGLESTORE_USER,
  password: process.env.SINGLESTORE_PASSWORD,
  database: process.env.SINGLESTORE_DB,
  ssl: {},
});

await c.execute(`CREATE ROWSTORE TABLE IF NOT EXISTS price_reference (
  brand VARCHAR(64), product VARCHAR(64), model VARCHAR(64),
  typical_new_price DOUBLE, source_url TEXT, checked_date VARCHAR(24),
  PRIMARY KEY (brand, product)
)`);

const today = new Date().toISOString().slice(0, 10);
for (const [brand, product, model, price, url] of ROWS) {
  await c.execute(
    `INSERT INTO price_reference (brand, product, model, typical_new_price, source_url, checked_date)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
     model=VALUES(model), typical_new_price=VALUES(typical_new_price),
     source_url=VALUES(source_url), checked_date=VALUES(checked_date)`,
    [brand, product, model, price, url, today],
  );
  console.log(`  ${brand} ${product} — ~$${price}`);
}

const [rows] = await c.execute('SELECT COUNT(*) n FROM price_reference');
console.log(`seeded ${(rows as { n: number }[])[0].n} price_reference rows`);
await c.end();
