#!/usr/bin/env node
/**
 * Seed demo branches + cars through the API gateway (so every Kafka event fires
 * and inventory/search are populated exactly as in real use).
 *
 * Requires Node 18+ and an existing account whose email is listed in
 * user-service ADMIN_EMAILS.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret node scripts/seed-demo.js
 *
 * Safe to re-run: existing branches/cars are reported and skipped.
 */
const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000/api';
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

const BRANCHES = [
  { name: 'Hitech City', code: 'HYD-HTC', city: 'Hyderabad', state: 'Telangana', address: 'Plot 12, HITEC City Main Rd' },
  { name: 'Hyderabad Airport', code: 'HYD-AIR', city: 'Hyderabad', state: 'Telangana', address: 'RGIA Arrivals, Shamshabad', openTime: '00:00', closeTime: '23:59' },
  { name: 'Koramangala', code: 'BLR-KOR', city: 'Bengaluru', state: 'Karnataka', address: '80 Feet Rd, Koramangala' },
  { name: 'Andheri East', code: 'BOM-AND', city: 'Mumbai', state: 'Maharashtra', address: 'Chakala, Andheri-Kurla Rd' },
  // Shared-ride stops
  { name: 'Suryapet Bus Stand', code: 'SRP-BUS', city: 'Suryapet', state: 'Telangana' },
  { name: 'Vijayawada Benz Circle', code: 'VJA-BNZ', city: 'Vijayawada', state: 'Andhra Pradesh' },
];

// Shared rides: route stops (branch code, minutes after departure, km from start)
const ROUTE = {
  name: 'Hyderabad → Vijayawada',
  stops: [['HYD-HTC', 0, 0], ['SRP-BUS', 150, 135], ['VJA-BNZ', 300, 275]],
};
// Daily trips for the next few days: [car registration, departure hour (IST), driver, ₹/km per seat]
const DAILY_TRIPS = [
  ['TS07 FD 4410', 6, 'Ravi Kumar', 2.5],   // Ertiga, 6 passenger seats
  ['TS07 FF 6630', 15, 'Anil Reddy', 2.2],  // Honda City, 4 passenger seats
];
const TRIP_DAYS = 5;

const CARS = [
  ['HYD-HTC', 'TS09 EA 1234', 'Maruti Suzuki', 'Swift', 2024, 'HATCHBACK', 'MANUAL', 'PETROL', 5, 1499],
  ['HYD-HTC', 'TS09 EB 2201', 'Maruti Suzuki', 'Baleno', 2023, 'HATCHBACK', 'AUTOMATIC', 'PETROL', 5, 1799],
  ['HYD-HTC', 'TS09 EC 3302', 'Hyundai', 'Creta', 2024, 'SUV', 'AUTOMATIC', 'DIESEL', 5, 2999],
  ['HYD-AIR', 'TS07 FD 4410', 'Maruti Suzuki', 'Ertiga', 2023, 'MUV', 'MANUAL', 'CNG', 7, 2499],
  ['HYD-AIR', 'TS07 FE 5521', 'Tata', 'Nexon EV', 2025, 'SUV', 'AUTOMATIC', 'ELECTRIC', 5, 2799],
  ['HYD-AIR', 'TS07 FF 6630', 'Honda', 'City', 2024, 'SEDAN', 'AUTOMATIC', 'PETROL', 5, 2299],
  ['BLR-KOR', 'KA01 MG 7788', 'Mercedes-Benz', 'C-Class', 2024, 'LUXURY', 'AUTOMATIC', 'PETROL', 5, 8999],
  ['BLR-KOR', 'KA01 MH 1212', 'Honda', 'City', 2023, 'SEDAN', 'MANUAL', 'PETROL', 5, 1999],
  ['BLR-KOR', 'KA01 MJ 3434', 'Toyota', 'Innova Crysta', 2023, 'MUV', 'MANUAL', 'DIESEL', 7, 3499],
  ['BOM-AND', 'MH02 FK 9090', 'Mahindra', 'XUV700', 2024, 'SUV', 'AUTOMATIC', 'DIESEL', 7, 3799],
  ['BOM-AND', 'MH02 FL 4545', 'Hyundai', 'i20', 2023, 'HATCHBACK', 'MANUAL', 'PETROL', 5, 1599],
];

// Photos live in frontend/public/cars (see CREDITS.md there)
const imageFor = (make, model) =>
  `/cars/${`${make} ${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;

let cookie = '';

async function call(method, path, body) {
  const res = await fetch(GATEWAY + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookies = res.headers.getSetCookie?.() || [];
  if (setCookies.length) cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

(async () => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (an account listed in user-service ADMIN_EMAILS).');
    process.exit(1);
  }

  const login = await call('POST', '/users/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (!login.success) throw new Error(`Login failed: ${login.message}`);
  if (login.loggedInUser?.role !== 'ADMIN') throw new Error(`${ADMIN_EMAIL} is not in ADMIN_EMAILS`);

  const existing = (await call('GET', '/admins/branches/branch?limit=100')).data || [];
  const branchIds = Object.fromEntries(existing.map((b) => [b.code, b.id]));

  for (const branch of BRANCHES) {
    if (branchIds[branch.code]) {
      console.log(`• branch ${branch.code} exists`);
      continue;
    }
    const res = await call('POST', '/admins/branches/branch', branch);
    if (!res.success) throw new Error(`Branch ${branch.code}: ${res.message}`);
    branchIds[branch.code] = res.data.id;
    console.log(`✓ branch ${branch.code} — ${branch.name}, ${branch.city}`);
  }

  for (const [code, registrationNumber, make, model, year, category, transmission, fuelType, seats, dailyRate] of CARS) {
    const res = await call('POST', '/admins/cars/car', {
      registrationNumber, make, model, year, category, transmission, fuelType, seats, dailyRate,
      branchId: branchIds[code],
      imageUrl: imageFor(make, model),
    });
    if (res.status === 409) console.log(`• car ${registrationNumber} exists`);
    else if (!res.success) throw new Error(`Car ${registrationNumber}: ${res.message}`);
    else console.log(`✓ car ${make} ${model} (${registrationNumber}) @ ${code} — ₹${dailyRate}/day`);
  }

  // ── Shared rides ──
  let route = ((await call('GET', '/admins/rides/route')).data || []).find((r) => r.name === ROUTE.name);
  if (!route) {
    const res = await call('POST', '/admins/rides/route', {
      name: ROUTE.name,
      stops: ROUTE.stops.map(([code, offsetMinutes, distanceKm]) => ({ branchId: branchIds[code], offsetMinutes, distanceKm })),
    });
    if (!res.success) throw new Error(`Route: ${res.message}`);
    route = res.data;
    console.log(`✓ route ${route.name}`);
  } else {
    console.log(`• route ${route.name} exists`);
  }

  const cars = (await call('GET', '/admins/cars/car')).data || [];
  const carByReg = Object.fromEntries(cars.map((c) => [c.registrationNumber, c]));
  for (let day = 1; day <= TRIP_DAYS; day++) {
    for (const [reg, hour, driverName, farePerKm] of DAILY_TRIPS) {
      const car = carByReg[reg.replace(/\s+/g, '')];
      if (!car) continue;
      // hour is IST (UTC+5:30)
      const d = new Date(Date.now() + day * 864e5);
      const departureAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0) - 330 * 60000);
      const res = await call('POST', '/admins/rides/trip', { routeId: route.id, carId: car.id, departureAt, driverName, farePerKm });
      if (res.status === 409) console.log(`• trip ${car.model} ${departureAt.toISOString().slice(0, 16)} — car already busy`);
      else if (!res.success) console.log(`! trip ${car.model}: ${res.message}`);
      else console.log(`✓ trip ${ROUTE.name} · ${car.make} ${car.model} · day +${day} ${hour}:00 IST`);
    }
  }

  console.log('\nDone. Try: GET /api/search/cars?location=Hyderabad  or  /api/search/rides?from=Hyderabad&to=Vijayawada&date=<YYYY-MM-DD>');
})().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
