# TicketHub: System Design

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part framework: requirements, estimates, API, data model, architecture, and trade-offs. It also explains how the design stops two people from buying the same seat.

---

## 1. Requirements

### Functional requirements

1. A user can register, log in and log out.
2. A user can browse and search events by name, city, category and date.
3. A user can open an event and see its seat map with the price and availability of every seat.
4. A user can select up to 4 seats and **hold** them for 5 minutes while they pay.
5. A user can release a hold before it expires.
6. A user can pay for the held seats and receive a confirmation.
7. A user can see all their tickets (upcoming and past) and open a ticket with its QR code.
8. For very popular events, users wait in a **virtual queue** before they can choose seats.

Out of scope for this version: refunds, resale of tickets, organiser dashboards.

### Non-functional requirements

| Quality | Requirement | Why it matters |
|---|---|---|
| **Speed** | Browsing pages load in under 300 ms (95th percentile). The seat map loads in under 1 s. Holding a seat answers in under 500 ms, even during a big sale. | Slow pages make people leave, and in a big sale people refresh and make the load worse. |
| **Correctness** | A seat is never sold to two people. Nobody is charged without getting a ticket, and nobody gets a ticket without paying. A hold that expires always frees its seat. | Double-booking means two people arrive at the gate with the same seat. This is the worst failure the system can have. |
| **Fairness** | First come, first served. Maximum 4 tickets per person per event. Bots are slowed down by login, rate limits and CAPTCHA. People in the queue are admitted in the order they joined. | If 200,000 people want 20,000 seats, everyone must believe the process was honest. |
| **Availability** | 99.9% uptime. If the payment provider is down, browsing and viewing tickets must still work. | Most traffic is browsing, and it should not depend on payments. |
| **Scalability** | Handle the big-sale peak (section 2) without a crash, by adding servers rather than rewriting code. | A crash during a big sale is the biggest public failure for a ticket site. |
| **Durability** | A paid order is never lost. Backups are taken and the database is replicated. | Customers have paid real money. |
| **Security** | Passwords are hashed. All traffic uses HTTPS. Card details are never stored by TicketHub (the payment provider handles them). | Protects users and meets payment rules. |

---

## 2. Estimates

### Normal day

- Registered users: 2,000,000. Visitors per day: 50,000 (2.5% of users).
- Page views: 50,000 visitors × 10 pages = **500,000 page views per day**.
- Average rate: 500,000 / 86,400 seconds ≈ **6 requests per second**.
- Traffic is not flat. Assume evenings are about 5 to 10 times busier than the average, so the normal peak is roughly **30 to 60 requests per second**.
- Tickets sold: 5,000 per day = 5,000 / 86,400 ≈ **0.06 purchases per second** (about 1 every 17 seconds on average, a few per second at the busiest moment at most).
- Ratio: 500,000 page views for 5,000 tickets means about **100 views for every ticket sold**. Normal traffic is **read-heavy**.

### Big sale (one very popular concert)

- 200,000 people try to buy 20,000 seats in the first 10 minutes (600 seconds).
- Arrivals: 200,000 / 600 ≈ **333 new people per second**, and most of them arrive in the first minute, so the first-minute rate is several times higher.
- Assumption: each person makes about 20 requests in those 10 minutes (load the event, refresh the seat map, try seats, retry after "taken", pay). That gives 200,000 × 20 = 4,000,000 requests, or 4,000,000 / 600 ≈ **6,700 requests per second on average**. In the first minute, with about 3 times the average, it reaches roughly **20,000 requests per second**.
- Seat hold attempts: assume 2 attempts per person = 400,000 attempts, about **670 per second on average**, perhaps **2,000+ per second in the first minute**. All of these are fighting for the same 20,000 rows.
- Successful sales: 20,000 tickets / 600 s ≈ **33 purchases per second**.
- Demand versus supply: 200,000 people for 20,000 seats is **10 people for every seat**. 180,000 people will not get a ticket, so the system must tell them quickly and clearly.

### Comparison

| Measure | Normal day | Big-sale peak | Difference |
|---|---|---|---|
| Requests per second (average) | about 6 | about 6,700 | about **1,100× more** |
| Requests per second (worst moment) | about 30 to 60 | about 20,000 | about **300 to 600× more** |
| Purchases per second | about 0.06 | about 33 | about **550× more** |
| Traffic type | 100 reads per sale, spread over a day | Reads and **writes to the same rows** at the same moment | Contention is the new problem |

Conclusion: the big sale is not just "more of the same". Normal traffic is easy and mostly reads, so a few servers and a cache handle it. The big sale is a thousand-fold spike, and it is a spike of **writes on the same 20,000 seats**, so we cannot solve it only by adding web servers. We need a queue to control the arrival rate, a cache for reads, and a database design that stays correct under heavy competition.

---

## 3. API Design

All endpoints use JSON over HTTPS. Endpoints marked 🔒 need a login token (`Authorization: Bearer <token>`).

| # | Method and path | Purpose | Success | Errors |
|---|---|---|---|---|
| 1 | `POST /auth/login` | Log in with email and password, get a token | `200` with token | `401` wrong credentials |
| 2 | `GET /events?q=&city=&category=&date=&page=` | Browse and search events (paginated) | `200` list of events | `400` bad filter |
| 3 | `GET /events/{event_id}` | Event details (name, venue, date, price range, sale status) | `200` | `404` |
| 4 | `GET /events/{event_id}/seats?section=` | Seat map with availability, from cache | `200` list of seats with status | `404`, `403` if the event needs a queue and the user has no admission pass |
| 5 | `POST /events/{event_id}/queue` 🔒 | Join the virtual queue for a popular event | `202` with queue position | `409` already in queue |
| 6 | `GET /events/{event_id}/queue/me` 🔒 | Check queue position or get an admission pass | `200` position or pass | `404` |
| 7 | `POST /holds` 🔒 | Hold seats: body `{ "event_id": 7, "seat_ids": [101, 102] }` | `201` with `hold_id` and `expires_at` | `409` a seat is already taken (nothing is held), `422` more than 4 seats, `429` rate limit |
| 8 | `DELETE /holds/{hold_id}` 🔒 | Release the held seats | `204` | `404`, `403` not your hold |
| 9 | `POST /orders` 🔒 | Pay for a hold: body `{ "hold_id": 55, "payment_token": "..." }` with header `Idempotency-Key` | `201` with the order and tickets | `402` payment failed, `409` hold expired, `404` |
| 10 | `GET /orders/{order_id}` 🔒 | See one order and its status | `200` | `404`, `403` |
| 11 | `GET /me/tickets` 🔒 | List all my tickets | `200` | `401` |

Example: holding seats

```
POST /holds
{ "event_id": 7, "seat_ids": [101, 102] }

201 Created
{ "hold_id": 55, "seat_ids": [101, 102], "expires_at": "2026-11-20T18:05:00Z" }

409 Conflict
{ "error": "SEAT_TAKEN", "seat_ids": [102] }
```

Design notes:

- `POST /holds` and `POST /orders` change data, so they use POST and never GET.
- `POST /orders` takes an **Idempotency-Key** header. If the user's phone retries the request after a bad connection, the server returns the same order instead of charging twice.
- Seat lists are paginated or split by section so the response stays small.

---

## 4. Data Model

Database: a relational database (for example PostgreSQL), because we need transactions and constraints.

### Tables

**users**

| Column | Type | Notes |
|---|---|---|
| user_id | PK | |
| email | text, UNIQUE, NOT NULL | |
| password_hash | text, NOT NULL | never the plain password |
| name | text | |
| created_at | timestamp | |

**events**

| Column | Type | Notes |
|---|---|---|
| event_id | PK | |
| name | text, NOT NULL | |
| venue | text | |
| city | text | indexed for search |
| starts_at | timestamp | indexed for search |
| sale_starts_at | timestamp | when tickets open |
| is_queue_required | boolean | true for very popular events |

**seats** (one row per seat per event)

| Column | Type | Notes |
|---|---|---|
| seat_id | PK | |
| event_id | FK → events | |
| section, row_label, seat_number | text/int | |
| price_cents | int, CHECK > 0 | |
| status | text, CHECK in (`AVAILABLE`, `HELD`, `SOLD`) | |
| held_by | FK → users, nullable | who holds it |
| hold_id | FK → holds, nullable | |
| hold_expires_at | timestamp, nullable | |
| | UNIQUE (event_id, section, row_label, seat_number) | the same physical seat is not listed twice |
| | CHECK (status = 'HELD' ⇒ held_by and hold_expires_at are NOT NULL) | |

**holds**

| Column | Type | Notes |
|---|---|---|
| hold_id | PK | |
| user_id | FK → users | |
| event_id | FK → events | |
| expires_at | timestamp | created time + 5 minutes |
| status | text | `ACTIVE`, `RELEASED`, `EXPIRED`, `CONVERTED` |

**orders**

| Column | Type | Notes |
|---|---|---|
| order_id | PK | |
| user_id | FK → users | |
| event_id | FK → events | |
| hold_id | FK → holds, UNIQUE | one hold can become only one order |
| total_cents | int | |
| status | text | `PENDING`, `PAID`, `FAILED` |
| idempotency_key | text, UNIQUE per user | stops double charging |
| payment_ref | text | reference from the payment provider |
| created_at | timestamp | |

**tickets** (one row per seat sold)

| Column | Type | Notes |
|---|---|---|
| ticket_id | PK | |
| order_id | FK → orders | |
| seat_id | FK → seats, **UNIQUE** | a seat can have at most one ticket, ever |
| qr_code | text, UNIQUE | for entry at the gate |

### Relationships

- One **user** has many **holds** and many **orders** (1 to many).
- One **event** has many **seats** (1 to many), and many holds and orders.
- One **hold** covers one or more **seats**, and a seat points back to its current hold.
- One **hold** becomes at most one **order** (1 to 1).
- One **order** has many **tickets** (1 to many), and each **ticket** belongs to exactly one **seat**. Seat to ticket is 1 to 0-or-1: that is the key rule.

```
users 1───* holds 1───0..1 orders 1───* tickets *───1 seats *───1 events
  │                                        ▲                         │
  └────────────────* orders ───────────────┘          events 1───* holds
```

---

## 5. How Double-Booking Is Prevented

The problem: 200,000 people compete for 20,000 seats, so thousands of requests for the same seat arrive at the same millisecond. If the code does "check if the seat is free, then mark it taken" as two separate steps, two requests can both see "free" and both succeed. That is a **race condition**.

We use three layers, from the main defence to the last safety net.

### Layer 1: One atomic conditional update (the main defence)

Holding a seat is a single SQL statement inside a transaction. The check and the change happen together, and the database locks the row while it runs:

```sql
BEGIN;

UPDATE seats
SET status = 'HELD', held_by = :user_id,
    hold_id = :hold_id, hold_expires_at = now() + interval '5 minutes'
WHERE seat_id IN (101, 102)
  AND event_id = 7
  AND (status = 'AVAILABLE'
       OR (status = 'HELD' AND hold_expires_at < now()));

-- The app checks the number of rows changed.
-- If it is not 2, ROLLBACK and return 409. Otherwise COMMIT.
COMMIT;
```

- If two requests arrive for seat 101, the database makes one wait on the row lock. The first changes the row to `HELD`. When the second runs, `status = 'AVAILABLE'` is no longer true, so it changes **0 rows** and gets a `409`. Only one can ever win.
- The transaction is **all or nothing**: if the user asks for 2 seats and only 1 is free, the whole transaction rolls back and they hold nothing. No one is left with half a group.
- To avoid **deadlocks** (A holds seat 1 and waits for seat 2, while B holds seat 2 and waits for seat 1), seats are always updated in ascending `seat_id` order.
- Expired holds are treated as free in the same `WHERE` clause, so a seat is never stuck even if the cleanup job is late.

### Layer 2: Safe payment step

When the user pays, one transaction confirms the sale:

```sql
BEGIN;

UPDATE seats
SET status = 'SOLD'
WHERE hold_id = :hold_id AND held_by = :user_id
  AND status = 'HELD' AND hold_expires_at > now();
-- Rows changed must equal the number of seats in the hold, else ROLLBACK.

INSERT INTO orders (...) VALUES (...);
INSERT INTO tickets (order_id, seat_id, qr_code) VALUES (...);
COMMIT;
```

- Only the person who holds the seat, and only before the hold expires, can turn it into `SOLD`.
- When payment starts, the hold is extended by 2 minutes so a slow card payment does not expire in the middle.
- The `Idempotency-Key` and the UNIQUE `hold_id` on orders mean a retried request returns the same order and never charges twice.
- If payment succeeds but the hold was lost (rare), the order is cancelled and the money is refunded automatically. We prefer a refund over selling a seat twice.

### Layer 3: Constraints as a last safety net

Even if there were a bug in the application code, the database refuses to break the rule:

- `tickets.seat_id` is **UNIQUE**, so a second ticket for the same seat fails.
- The `CHECK` on `seats` stops a `HELD` row without an owner or expiry.
- `orders.hold_id` is **UNIQUE**, so one hold cannot become two orders.

### Why not only a cache or in-memory lock?

A lock in application memory fails when there are several servers. A cache (like Redis) can be used for speed, but it can lose data or go out of date. So the **database is the single source of truth** for seat status. The cache is only used to show the seat map faster, and a seat shown as free in the cache is always re-checked by the database when the user tries to hold it.

---

## 6. Architecture

```
                         Users (browsers / phones)
                                    |
                                    v
                    +-------------------------------+
                    |  CDN (static files, images)   |
                    +-------------------------------+
                                    |
                                    v
                    +-------------------------------+
                    | Load balancer + rate limiter  |
                    +-------------------------------+
                         |                   |
               (browse, seats)          (big sale)
                         |                   |
                         |                   v
                         |        +----------------------+
                         |        | Virtual queue /      |
                         |        | waiting room         |
                         |        +----------------------+
                         |                   | admits users
                         v                   v   at a steady rate
                    +-------------------------------+
                    |   API servers (many, stateless)|
                    +-------------------------------+
                      |            |              |
                      v            v              v
             +-----------+  +--------------+  +------------------+
             |  Cache    |  | Primary DB   |  | Payment provider |
             | (events,  |  | (users,      |  | (external)       |
             |  seat map)|  | seats,orders)|  +------------------+
             +-----------+  +--------------+
                                  |   |
                       replicates |   | writes
                                  v   v
                          +-------------+      +------------------+
                          | Read replica|      | Message queue    |
                          +-------------+      +------------------+
                                                       |
                                                       v
                                         +-----------------------------+
                                         | Background workers          |
                                         | (expire holds, send emails/ |
                                         |  tickets, clean up)         |
                                         +-----------------------------+
```

### Components

- **CDN:** stores images, CSS and JavaScript close to users, so these never reach our servers. This removes a large part of the traffic.
- **Load balancer and rate limiter:** spreads requests over many API servers, and limits how many requests one user or IP can make per second. It slows down bots and refresh-spammers.
- **Virtual queue (waiting room):** for popular events, users get a place in line and are let in at a steady rate that the database can handle (for example, a few hundred per second), in the order they arrived. This turns a violent spike into a smooth flow and is the main tool for fairness.
- **API servers:** stateless servers that run the endpoints from section 3. Because they keep no state, we add more of them when traffic grows.
- **Cache:** keeps event details and the seat map for a few seconds, so thousands of "view seats" requests do not hit the database. It is only used for reads.
- **Primary database:** the source of truth for users, seats, holds, orders and tickets. All seat changes happen here, using the transactions in section 5.
- **Read replica:** a copy of the database used for read queries such as search and "my tickets", so reads do not slow down the writes.
- **Payment provider:** an external service that handles card details. TicketHub stores only a reference.
- **Message queue and background workers:** slow jobs (sending confirmation emails, generating QR codes, releasing expired holds) are put on a queue and done later, so the buyer gets a fast response.

### How it survives the big sale

1. The **CDN** absorbs static files, so only real API calls reach us.
2. The **queue** limits how many people can reach the seat map at once, so the database sees a controlled rate (hundreds per second), not 20,000 per second.
3. The **cache** answers seat-map reads, so most of the 6,700 requests per second never touch the database.
4. Only the **hold and pay** steps (a few hundred writes per second) reach the primary database, and they are short transactions on single rows.
5. **Holds expire** after 5 minutes, so seats from people who gave up return to the pool.
6. Slow work (emails, QR codes) is moved to **workers**, and browsing keeps working even if the payment provider is slow.
7. We can **add API servers** before a known sale (the sale time is announced in advance), and the people who don't get a seat get a clear "sold out" message right away instead of a spinning page.

---

## 7. Trade-offs

1. **Virtual queue (fairness and stability) versus simplicity and user experience.**
   The queue protects the database and gives everyone an orderly place, but it adds more parts to build, and users must wait and may feel it is a hurdle. Without it, the fastest connections and bots would win, and the servers could crash. I chose the queue for popular events only, so normal events stay simple and quick.

2. **Strong consistency in the database versus speed of a cache.**
   Seat status lives in the primary database, so the answer is always correct. The cost is that writes go through one primary, which limits how fast we can hold seats. The seat map from the cache can be a few seconds old, so a user can click a seat that was just taken and get a `409`. I accept this: a slightly stale picture is better than a wrong sale. A message like "that seat was just taken, please choose another" is cheap, but a double-booked seat is not.

3. **Hold time: 5 minutes.**
   A longer hold gives people time to pay but blocks seats that may never be bought, which hurts others during a big sale. A shorter hold frees seats faster but causes more failed payments for slow users. Five minutes, extended by 2 minutes once payment starts, is a balance.

4. **Locking rows (pessimistic) versus retrying on conflict (optimistic).**
   Many people fight for the same seats, so letting the database lock the row and take turns costs a short wait, but avoids many failed retries. If conflicts were rare, optimistic checking would be faster. During a sale, conflicts are common, so the locking approach is the right one.

5. **Refund over double-sell.** If payment succeeds but the hold was lost, we refund automatically instead of risking a double sale. This costs us an occasional refund and an unhappy buyer, but protects correctness, which is our most important requirement.

---