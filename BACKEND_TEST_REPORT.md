# Backend ↔ Frontend Integrity Test Report

**App:** OYO Tours portal · **Backend:** Supabase (Postgres)
**Date:** 10 Aug 2026 · **Scope:** Does every frontend action correctly persist to and reload from the backend?

## How this was tested

The app's entire backend lives behind one file (`src/lib/api.js`); every page and the
store reach Supabase only through it. So the test was a systematic audit of three things,
cross-checked against the **live database schema**:

1. **Write coverage** — every state-changing action in `AppStore.jsx` must call a matching `api*` writer.
2. **Mapper fidelity** — every field the app saves must have a column (or JSONB home); nothing silently dropped.
3. **Load + flows** — `loadAll` must read back everything written; the booking lifecycle must survive a reload.

Each finding below was confirmed against the actual code (line numbers) **and** the live schema.

## Verdict

The **catalogue side is solid** — packages, departures, guests, inventory, airlines, vendors and team
all persist correctly, departure seat counts update on booking/cancel, and inventory
payment/release/status changes save. The earlier `updateDeparture` (pricing) fix holds.

The **bugs are concentrated in two areas**: the **bookings domain** and a few **package fields**.
Both share one root cause — the `bookings` and `packages` tables were given flat, fixed columns, so
any field added to those records later has no home and is dropped on save. Because your `guests` and
`bookings` tables are currently empty, the booking bugs haven't bitten yet — but they will the moment
real bookings start.

---

## Critical / High — data silently lost on reload

### 1. Package deactivation doesn't persist
- **Where:** `PackageDetail.jsx:80,82` → `updatePackage(id, {active})` → `apiUpdatePackage` (`api.js:139`) filters through `PKG_COL`, which has **no `active` key**; there is **no `active` column**.
- **Effect:** Deactivating a package cancels its bookings (those persist) but the package's own inactive flag does not. **After reload the package is Active and bookable again** — with its bookings already cancelled.

### 2. Custom Terms & Conditions don't persist
- **Where:** `PackageForm.jsx:289` sets `terms`; omitted from `pkgToDb`/`PKG_COL`; no column. Read at `PackageDetail.jsx:889`.
- **Effect:** Every package's custom T&C reverts to the generic default after reload.

### 3. Booking inventory allocation + manifest not persisted
- **Where:** `addBooking` (`AppStore.jsx:493-497`) persists the booking and the departure seat count, but the reducer also bumps the linked flight/hotel block's `allocatedSeats` and appends the passenger manifest — and there is **no `apiUpsertInventory`** for that. The link IDs (`airlineInventoryId`/`hotelInventoryId`) aren't in the booking schema either, so it can't be re-derived after reload.
- **Effect:** Book a seat → Inventory shows the seat allocated and the traveller in the manifest → reload → allocation drops back to 0 and the manifest is empty. Ops under-counts what's actually sold.

### 4. Cancellation / refund record not persisted
- **Where:** `cancelBooking` (`AppStore.jsx:717-724`) builds a `cancellation` object (refund amount, `refundStatus: 'pending'`, applied rule); `setBookingStatus` persists only `status` + `payment_note` (`api.js:159`). No `cancellation` column.
- **Effect:** Cancel a booking with a refund owed → it shows in the refunds queue → reload → status stays "Cancelled" but the refund record is gone. The Finance refund pipeline loses the item.

### 5. `markRefunded` is memory-only
- **Where:** `AppStore.jsx:728-731` dispatches only; no `api*` call; no column.
- **Effect:** Finance marks a refund paid → reload → it shows `pending` again. **Double-refund risk.**

### 6. `approveBookingPayment` is memory-only
- **Where:** `AppStore.jsx:742-745` dispatches only.
- **Effect:** Finance approves a logged payment → reload → approval clears; it returns to the pending-approval queue.

### 7. Traveller / passenger capture is memory-only
- **Where:** `setBookingTravellers` (`AppStore.jsx:735-739`) dispatches only; neither the booking traveller fields nor the inventory manifest are persisted.
- **Effect:** Enter passenger names + passport details before the naming deadline → reload → all gone, naming progress resets to 0. (Note: passport data does **not** survive via the manifest, because the manifest write isn't persisted either — see #3.)

### 8. Advance-payment amount not persisted
- **Where:** `Checkout.jsx:210-211` sets `advanceAmount`/`advancePaid` on the booking; no columns.
- **Effect:** The advance collected is lost after reload; only the free-text `paymentNote` retains it as prose. Finance can't reconcile the number.

---

## Medium — lost but lower blast radius

- **Booking line items & config not persisted** (`Checkout.jsx:213-224`): `addOns` line items, `rooms`, `hotelPreferences`, per-traveller `travellerDetails`, and the booking `history` audit trail have no columns. The grand-total `amount` already bakes in add-ons, so the total is right, but the breakdown, room config, preferred hotels and audit log vanish on reload. Uploaded `paymentProof` on any status change is also lost.
- **Package cover focal point** (`PackageForm.jsx:250`): `coverFocal` not persisted → hero/card images re-crop to center after reload.
- **Package `days`** (`PackageForm.jsx:248`): the raw editable day count isn't persisted; the display label (`durationLabel`, e.g. "5N / 7D") *is*, but re-opening the editor recomputes days as `nights + 1`, so a custom 5N/7D silently becomes 5N/6D on the next edit.

## Low — no user-visible impact

- Departure `airlineInventoryId`/`hotelInventoryId` (`PackageForm.jsx:307-308`) aren't persisted, but checkout re-derives the link by package + date, so nothing breaks.
- Guest `passportNo` (`Checkout.jsx:206`) is dropped (no column); the guest add form never sets it anyway.

## Security observation (not a functional bug)

All 8 tables have **RLS enabled** and writes currently succeed, so policies are permissive
(effectively open to the anon key). Fine for an internal tool today, but before any external
exposure the policies should be tightened. This is separate from the persistence bugs above.

---

## What passed (verified working)

Package/departure/guest/inventory/airline/vendor/team create-update-delete all persist ·
departure `seatsBooked` updates on booking **and** restores on cancel · inventory
payment/`reversePayment`/`releaseSeats`/`setInventoryStatus` all persist via full-doc upsert ·
`updateDeparture` (pricing) persists · `loadAll` reads back all 8 collections.

## Recommended fix (one root-cause change)

The booking bugs (#3–#8, plus the Medium booking items) all stem from `bookings` having fixed
columns. The cleanest fix is to **store bookings as a full JSONB `doc`** — exactly how `inventory`
and `team` already work — and route every booking mutation through a single `apiUpsertBooking(fullRecord)`.
That removes the whole class of "field has no column" bugs at once and future-proofs the shape.
For packages, add the missing columns (`active`, `terms`, `days`, `cover_focal`) or likewise move the
flexible fields into a JSONB blob, and add `active` to `PKG_COL`.

I can implement either approach on request.
