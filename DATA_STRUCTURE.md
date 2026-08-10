# OYO Tours — Data Structure

This document describes the data model behind the OYO Tours portal: the entities, their fields, how they relate to one another, the values the app derives at runtime, and the store actions that mutate them.

The app is a single-page React application backed by an in-memory reducer store (`src/store/AppStore.jsx`). When Supabase is configured it hydrates from and writes through to the backend; otherwise the seed arrays in `src/store/data.js` are the source of truth. **The portal now ships empty** — every seed array is `[]` except the default **airlines** registry, which stays pre-populated so airline pickers and logos work out of the box.

---

## Entity overview

| Entity | Store key | Seed export | Ships with data? |
|---|---|---|---|
| Package | `packages` | `seedPackages` | No — empty |
| Departure | `departures` | `seedDepartures` | No — empty |
| Guest | `guests` | `seedGuests` | No — empty |
| Booking | `bookings` | `seedBookings` | No — empty |
| Team member | `team` | `seedTeam` | No — empty |
| Inventory (airline / hotel) | `inventory` | `seedInventory` (alias `seedAirlineInventory`) | No — empty |
| Airline | `airlines` | `seedAirlines` | **Yes — default list** |
| Vendor | `vendors` | `seedVendors` | No — empty |
| T&C template | `termsTemplates` | (localStorage `oyo.termsTemplates`) | No — empty |

---

## Relationships at a glance

```
Package ─1─────many→ Departure          (Departure.packageId → Package.id)
Package ─1─────many→ Inventory          (Inventory.packageId → Package.id)
Guest   ─1─────many→ Booking            (Booking.guestId    → Guest.id)
Package ─1─────many→ Booking            (Booking.packageId  → Package.id)
Departure ─1───many→ Booking            (Booking.departureId→ Departure.id)
Booking ──────────→ Inventory (opt.)    (airlineInventoryId / hotelInventoryId → Inventory.id)
Inventory ────────→ Airline (by name)   (Inventory.airline  → Airline.name)
Inventory ────────→ Vendor  (by name)   (Inventory.vendors[]→ Vendor names)
Airline / Vendor    are flat name registries reused across records.
```

A **package** is the sellable product. Each package has one or more **departures** (the unit that carries flights, a seat count, and a per-category pricing grid). A **booking** ties a guest to a package + category + departure with a pax mix; its amount is computed from the pricing grid and the seats it consumes equal the total pax. **Inventory** records are the operations/finance source of truth for bulk airline-seat or hotel-room purchases; bookings can allocate against them.

---

## Package

A tour product (destination + origin city). Created via the UI or bulk upload.

| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g. `pkg-xxxxxx` (auto-generated) |
| `code` | string | Auto-assigned sequential code `PKG-1001`, `PKG-1002`, … |
| `name` | string | Product name |
| `origin` | string | Departure city label, e.g. `Ex Mumbai` |
| `destinationCity` | string | Primary destination |
| `country` | string | |
| `coverUrl` | string | Cover image URL (optional) |
| `coverFocal` | object | `{x, y}` focal point for the cover crop (optional) |
| `durationLabel` | string | e.g. `5N / 6D` |
| `nights` | number | |
| `destinationsLabel` | string | Multi-stop summary, e.g. `2N Port Blair · 2N Havelock` |
| `blurb` | string | Short marketing line |
| `categories` | string[] | Subset of `Deluxe`, `Super Deluxe`, `Standard` |
| `hotels` | array | Per-category `{category, rows:[{city, options}]}` |
| `inclusions` | string[] | |
| `exclusions` | string[] | |
| `itinerary` | array | `{day, title, desc}` |
| `transfers` | array | `{from, to, timing}` |
| `addOns` | array | `{item, price}` supplements |
| `payment` | object | `{bookingAmount, balance, taCommission}` |
| `cancellation` | array | `{timeline, penalty, days?, refundPercent?}` |
| `active` | boolean | `false` = Inactive (defaults to active) |

Lifecycle: packages are filtered **Active / Inactive** in the admin list; guests only ever see active packages.

---

## Departure

The inventory unit under a package — a dated round-trip with seats and pricing.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `dep-xxxxxx` |
| `packageId` | string | → Package.id |
| `date` | string | Outbound date `YYYY-MM-DD` |
| `returnDate` | string | |
| `outbound` | object | `{from, to, airline, flightNo, departTime, arriveTime}` |
| `inbound` | object | Same shape as outbound (return leg) |
| `seatsTotal` | number | Total seats offered |
| `seatsBooked` | number | Increments as bookings are made |
| `pricing` | object | Keyed by category → occupancy grid (see below) |

**Occupancy pricing grid** (per category) uses the `OCCUPANCY` keys:

`adult` (Per Adult, twin sharing), `extraBed` (Adult on extra bed), `cwb` (Child with bed), `cnb` (Child without bed), `single` (Single occupancy).

Derived per package (in the store): `fromPrice` (lowest adult fare across departures), `pkgSeats` (`{total, avail, departures}`).

---

## Guest

| Field | Type | Notes |
|---|---|---|
| `id` | string | `gst-xxxxxx` |
| `name`, `email`, `phone`, `city`, `company` | string | |
| `createdAt` | string | `YYYY-MM-DD` |
| `notes` | string | Free text |

---

## Booking

Ties a guest to a package + category + departure with a pax mix.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `bkg-xxxxxx` |
| `ref` | string | `OYO-#####` (auto) |
| `guestId` | string | → Guest.id |
| `packageId` | string | → Package.id |
| `departureId` | string | → Departure.id |
| `category` | string | One of the package's categories |
| `pax` | object | `{adult, extraBed, cwb, cnb, single}` counts |
| `seats` | number | = total pax |
| `amount` | number | Computed from the grid × pax |
| `advanceAmount` / `advancePaid` | number / bool | Booking-amount tracking |
| `status` | string | `Processing` → `Confirmed` (or `Cancelled`) |
| `agent` | string | Who created it, e.g. `Priya (Sales)` |
| `createdAt` | string | |
| `paymentNote`, `paymentProof` | string / object | |
| `paymentApproved`, `approvedBy`, `approvedAt` | bool / string | Finance sign-off |
| `history` | array | Audit log `{status, note, by, at, proofName?}` |
| `travellerDetails` | array | Per-traveller profile `{type, room, label, firstName, lastName, gender?, phone?, email?, passportNo?, passportCountry?, passportExpiry?, docs[]}` |
| `hotelPreferences` | array | `{city, property}` (optional) |
| `cancellation` | object | `{type, label, reason, by, at, amountPaid, refundAmount, refundStatus, appliedRule}` |
| `airlineInventoryId` / `hotelInventoryId` | string | Inventory this booking allocates against (optional) |

**Statuses** (`BOOKING_STATUSES` + tones): `Processing` → proposal/gold, `Confirmed` → won/green, `Cancelled` → urgent/red. `normalizeStatus()` collapses any legacy value to one of these three.

---

## Team member

Staff with portal access. **Login does not depend on this list** — the sign-in screen offers three fixed roles (Admin / Operations / Sales) regardless of team contents.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `tm-xxxxxx` |
| `name`, `email` | string | |
| `role` | string | e.g. `Admin` |
| `status` | string | `Active` / `Invited` |
| `createdAt` | string | |

---

## Inventory (airline & hotel)

One shared shape covers both **airline seat blocks** (`type: 'airline'`) and **hotel room blocks** (`type: 'hotel'`); only the display labels differ (`INVENTORY_LABELS`). Fields are shared "slots".

| Field | Type | Airline meaning | Hotel meaning |
|---|---|---|---|
| `id` | string | `inv-xxxxxx` / `hinv-x` | same |
| `type` | string | `airline` | `hotel` |
| `inventoryId` | string | Human ref, e.g. `AI-BOM-IXZ-1001` | e.g. `HT-HAV-1051` |
| `airline` | string | Airline name → Airline registry | Hotel name |
| `departureCity` / `arrivalCity` | string | Route ends | City / property |
| `sector` | string | `BOM → IXZ` | `Havelock · 3N` |
| `flightNo` | string | Flight number | Room type |
| `departureDate` / `returnDate` | string | Travel dates | Check-in / check-out |
| `nights` | number | — | Stay length |
| `totalSeats` | number | Seats purchased | Rooms |
| `allocatedSeats` | number | Sold/allocated | same |
| `releasedSeats` | number | Released back | same |
| `namesCaptured` | number | Passenger names on file | Rooming names |
| `seatCost` | number | Per-unit cost to OYO | |
| `advancePaid` / `advanceDate` | bool / string | Finance | |
| `balancePaid` / `balanceDate` | bool / string | Finance | |
| `status` | string | `Draft` / `Active` / `Inactive` | |
| `packageId` | string | → Package.id | |
| `vendors` | string[] | → Vendor names | |
| `category`, `pricing`, `imageUrl` | — | (hotel records) | |
| `remarks` | string | Free text | |
| `manifest` | array | Captured traveller profiles | |
| `paymentLog` | array | `{which, label, amount, note, proofName?, by, at, reversed?}` | |

### Statuses vs. allocation

- **Status** (`INVENTORY_STATUSES`) is one of exactly three: `Draft`, `Active`, `Inactive`. It auto-flips to `Inactive` once the travel date has passed or the whole block is released; a manual `Draft`/`Inactive` is respected; any legacy value resolves to `Active`.
- **Allocation label** (`ALLOCATION_LABELS`) is *derived*, not settable: `Available` → `Partially Allocated` → `Fully Allocated` / `Sold Out` → `Released`.
- **Payment status** (`PAYMENT_STATUSES`): `Advance Pending`, `Advance Paid`, `Fully Paid`, `Overdue`.

### Derived values (`computeInventory`)

For each record the store computes: `available` (total − allocated − released), `utilization` %, `namesPending`, `namingPct`, the three deadlines (`namingDeadline`, `releaseDeadline`, plus `balanceDueDate`), `releaseDaysLeft`, `namingDaysLeft`, `tripEnd`, `tripDaysLeft`, `isPast`, `fullyReleased`, and the resolved `status` / `allocationLabel`.

**Deadline rules** (`DEADLINE_RULES`, days before departure, overridable per record): naming = 4, release = 11, balance = 10.

---

## Airline (default registry — ships populated)

The only pre-seeded list. Each entry: `{ name, logoUrl }`. When `logoUrl` is empty the UI renders a generated monogram badge. Default airlines:

`Air India`, `IndiGo`, `Vistara`, `SpiceJet`, `Akasa Air`, `Emirates`, `Qatar Airways`, `Singapore Airlines`, `Thai Airways`, `VietJet Air`.

New airlines can be added through the UI (`addAirline`), which also lets an existing airline gain a logo.

---

## Vendor

A flat list of consolidator / DMC / supplier names (`string[]`). One inventory block can be sourced from more than one vendor. Starts empty; added via `addVendor` or as inventory is created.

---

## Terms & Conditions templates

Reusable named T&C blocks, persisted to **localStorage** under key `oyo.termsTemplates` (not the backend). Shape: `{ id, name, text }`. `DEFAULT_TERMS` is the fallback text used when a new package is created with no template chosen.

---

## Store shape & actions

`initialState` (in `AppStore.jsx`) wires each seed array to a store key: `packages`, `departures`, `guests`, `bookings`, `team`, `inventory`, `airlines`, `vendors`, `termsTemplates`, plus `user`, `hydrated`, `backend`.

Key action creators exposed through `useApp()`:

- **Packages:** `addPackage` (auto-codes `PKG-####`, fills empty arrays), `updatePackage`.
- **Departures:** `addDeparture` (seeds `seatsBooked: 0`), `updateDeparture`.
- **Guests:** `addGuest`.
- **Team:** `addTeamMember` (defaults `status: 'Invited'`), `removeTeamMember`.
- **Bookings:** `addBooking` (computes seats/ref, decrements departure seats, rolls names into linked inventory manifest), `setBookingStatus`, `setBookingTravellers`, `cancelBooking` (computes refund from the package cancellation policy), `markRefunded`, `approveBookingPayment`.
- **Inventory:** `addInventory` (defaults `status: 'Draft'`), `updateInventory`, `deleteInventory`, `releaseSeats`, `setInventoryStatus`, `recordPayment`, `reversePayment`. Read helpers: `inventoryView` (all records enriched by `computeInventory`), `inventoryById`, `inventoryForBooking`, `inventoryForVendor`, `hotelRegistry`, `opsStats`.
- **Airlines / Vendors:** `addAirline`, `airlineByName`, `addVendor`.
- **T&C:** `saveTermsTemplate`, `deleteTermsTemplate` (both persist to localStorage).

Roll-up stats (`stats`) expose counts and money totals (packages, departures, seats, active/processing/confirmed bookings, revenue, pipeline) for dashboards.

---

## Adding data to the empty portal

Because everything but airlines ships empty, first-run flow is: sign in (any role, any password — it's a prototype) → **Add package** (or **Bulk upload**) → add **departures** with flights + pricing → optionally create **inventory** blocks → create **guests** and **bookings**. Airlines are already available in every airline picker; add more as needed. Vendors and T&C templates accumulate as you create records.
