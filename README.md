# OYO Tours — Booking Portal (Prototype)

Internal portal for the OYO team to sell **fixed-departure holiday packages**
(e.g. *Andaman Ex-Mumbai*, *Phuket Ex-Delhi*). Admins load departures with
round-trip flights, seats and occupancy pricing; agents book packages for
guests; inventory decrements automatically; and because payment is collected
**offline**, an admin manually advances each booking's status.

Built in the **Eventstrat design system** — white sidebar, lilac canvas, single
brand purple (#420886), Montserrat, semantic status colors — with the **OYO**
logo throughout.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Any password works at login. Pick **Admin** (loads departures, adds guests,
updates booking status) or **Booking Agent** (books & tracks).

## Data model

- **Package** — a sellable tour product (destination + origin city). Holds
  duration, destinations, categories (Deluxe / Super Deluxe / Standard), hotels
  per category, day-wise itinerary, inclusions/exclusions, add-on supplements,
  and payment/cancellation policy. Each card shows a city cover photo.
- **Departure** — the inventory unit. A departure date with a **round-trip
  flight pair**, a **seat count** (decrements on booking), and a **per-category
  occupancy pricing grid** (Per Adult / Extra Bed / Child w-bed / Child no-bed /
  Single).
- **Booking** — package → category → departure → pax mix. Amount is computed
  from the grid; seats consumed = total pax. Status flows Reserved → Awaiting
  Payment → Confirmed / Cancelled (admin-managed, offline payments).

## Backend (Supabase)

The app reads/writes a Supabase project (**OYO Tours Portal**). Config lives in
`.env`:

```
VITE_SUPABASE_URL=…
VITE_SUPABASE_ANON_KEY=…
```

- On load, the app hydrates all data from Supabase.
- Adding a guest, adding a departure, creating a booking, and updating a status
  all write through to Supabase (and adjust `seats_booked`).
- **No `.env`?** The app automatically falls back to a built-in in-memory store
  seeded with the same data — so it runs anywhere with zero config.

Schema: `packages`, `departures`, `guests`, `bookings` (rich fields stored as
JSONB). Row-Level Security is on with permissive anon policies **for this
prototype only** — tighten before any real use.

## Cover images

Package cards pull a real city photo from a public image URL (`coverUrl` in the
data / `cover_url` column). If a photo fails to load, a branded gradient with
the city name is shown. Swap the URLs for your own photos anytime.

## Notes

This is a front-end prototype with a prototype backend — not production-hardened
(auth is mocked, RLS is permissive). See `DEPLOY.md` to ship it to Vercel.
