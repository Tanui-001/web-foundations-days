# SnapShare — Scaling Plan

A scaling plan for **SnapShare**, a photo-sharing app where users upload photos and
scroll a feed of photos from people they follow.

---

## 1. Assumptions

- **Registered users:** 10,000,000
- **Daily active users (DAU):** 10% of registered users
- **Uploads per active user per day:** 1 photo
- **Feed pages viewed per active user per day:** 50
- **Average photo size:** 2 MB (original)
- **Thumbnail size:** 50 KB (0.05 MB) per photo
- **Peak factor:** 5× the average rate
- **Photos are immutable** once uploaded (no editing/deleting in this estimate)
- **A "feed view" = one feed page request** (a page renders multiple photos; we estimate
  page requests, not individual photo renders)
- **Seconds per day:** 86,400

### Daily active users

**≈ 12 uploads/sec average, ≈ 58 uploads/sec peak.**

### Feed views per second

**≈ 730 TB of originals + ≈ 18 TB of thumbnails ≈ 748 TB (~0.75 PB) per year.**
With 3× replication in object storage, budget **~2.2 PB/year** of raw capacity.

---

## 3. Read-Heavy or Write-Heavy?

**SnapShare is strongly read-heavy.**

- **Writes:** ~12 uploads/sec average (~58/sec peak).
- **Reads:** ~580 feed *page* requests/sec average (~2,900/sec peak), and each page
  fans out to many photo/metadata lookups plus CDN-served image bytes. The effective
  photo-read rate is in the tens of thousands per second at peak.

**What this means for the design:**

- **Optimize the read path aggressively:** CDN for image bytes, an in-memory cache
  (Redis) for feed pages and hot metadata, and read replicas for database queries.
- **Keep the write path simple and asynchronous:** accept the upload, store the file
  in object storage, enqueue thumbnail/metadata work, and return quickly to the user.
- **Precompute/denormalize feeds** (fan-out on write, or a hybrid) so feed rendering
  doesn't require expensive joins at read time.
- **Scale reads horizontally** (replicas, cache, CDN); writes need far less capacity
  but must be durable.

---

## 4. Why Photos Should NOT Be Stored in the Database

- **Size:** 2 MB blobs × 365M/year = hundreds of TB. Relational databases are optimized
  for small rows, not large binary objects; blobs bloat tables, backups, and replication
  logs.
- **Performance:** Serving image bytes from the DB competes with metadata queries for
  connections, buffer pool, and I/O; a feed view would hammer the DB instead of a CDN.
- **Cost & scalability:** Object storage is orders of magnitude cheaper per GB than DB
  storage, and scales horizontally without sharding the database.
- **Caching/CDN:** Files in object storage can be served through a CDN with HTTP caching;
  DB blobs cannot easily be cached at the edge.
- **Operational safety:** Large blobs make backups, restores, migrations, and failovers
  slow and risky.

**Where they should go instead:** **Object storage** (e.g., S3 / GCS / Azure Blob) for
originals and thumbnails, fronted by a **CDN**. The database stores only **metadata**
(photo ID, owner ID, object key/URL, dimensions, timestamp, status, etc.).

---

## 5. Architecture (Text Diagram)
┌──────────────┐
│ Users │
│ (mobile/web) │
└──────┬───────┘
│ HTTPS
▼
┌──────────────┐
│ CDN │◄───────────────┐
│ (images, │ │
│ thumbnails) │ │
└──────┬───────┘ │
│ cache miss │
▼ │
┌──────────────┐ │
│ Load │ │
│ Balancer │ │
└──────┬───────┘ │
│ │
┌───────────────┼───────────────┐ │
▼ ▼ ▼ │
┌────────────┐ ┌────────────┐ ┌────────────┐ │
│ App Server │ │ App Server │ │ App Server │ │
│ #1 │ │ #2 │ │ #N │ │
└─────┬──────┘ └─────┬──────┘ └─────┬──────┘ │
│ │ │ │
┌───────┴───────┬───────┴───────┬───────┴───┐ │
▼ ▼ ▼ ▼ │
┌──────────┐ ┌────────────┐ ┌──────────┐ ┌─────────┐│
│ Cache │ │ Message │ │ Primary │ │ Object ││
│ (Redis) │ │ Queue │ │ DB │ │ Storage ││
│ feeds, │ │ (uploads, │ │ (writes) │ │ (photos,││
│ metadata │ │ thumbnails)│ └────┬─────┘ │ thumbs) ││
└──────────┘ └─────┬──────┘ │ └────┬────┘│
│ ▼ │ │
▼ ┌────────────┐ │ │
┌──────────┐ │ Read │ │ │
│ Thumbnail│ │ Replica │ │ │
│ Worker │ │ DB │ │ │
└────┬─────┘ └────────────┘ │ │
│ │ │
└──────────► Object Storage ◄─┘ │
│ │
└─────────────────┘
(CDN origin pull)

text

---

## 6. Components — One Sentence Each

- **CDN:** Caches and serves photo/thumbnail bytes from edge locations near users,
  absorbing the massive read traffic and cutting latency and origin load.
- **Load Balancer:** Distributes incoming HTTP requests across app servers so no single
  server is overwhelmed and unhealthy servers are bypassed.
- **App Servers:** Stateless application instances that handle uploads, feed requests,
  auth, and orchestration between cache, DB, queue, and object storage.
- **Cache (Redis):** Stores hot feed pages and frequently read metadata in memory to
  serve reads in milliseconds and shield the database.
- **Message Queue:** Durably buffers upload events so thumbnail generation and metadata
  indexing happen asynchronously without blocking the user's upload.
- **Primary Database:** Stores authoritative metadata (users, follows, photo records,
  object keys) and handles all writes.
- **Read Replica:** Serves read queries (feed metadata lookups, profiles) so read traffic
  doesn't compete with writes on the primary.
- **Object Storage:** Durably stores the actual photo files and thumbnails at low cost
  and effectively unlimited scale, acting as the CDN's origin.
- **Thumbnail Worker:** Consumes queue messages, downloads the original, generates the
  50 KB thumbnail, uploads it to object storage, and updates metadata.

---

## 7. Upload Flow (Step by Step, Including the Thumbnail Job)

1. **Client requests upload** — the app server validates the user's session and returns a
   pre-signed object-storage URL (or accepts a direct multipart upload).
2. **Client uploads the original photo** directly to **object storage** (bypassing app
   servers for the heavy bytes), then notifies the app server that the upload completed.
3. **App server writes metadata** to the **primary database**: a new photo row with owner
   ID, object key, size, content type, and status = `pending`.
4. **App server enqueues a job** on the **message queue** containing the photo ID and
   object key.
5. **App server returns success** to the client immediately (the photo appears in the
   user's own feed with a placeholder).
6. **Thumbnail worker picks up the job**, downloads the original from object storage,
   generates a 50 KB thumbnail (resize/compress), and uploads the thumbnail to object
   storage.
7. **Worker updates metadata** in the primary DB: sets the thumbnail key and status =
   `ready`; it also invalidates/refreshes relevant **cache** entries (e.g., the uploader's
   feed).
8. **Fan-out:** the photo ID is appended to followers' feed lists (in cache/DB, depending
   on the fan-out strategy) so it appears in their feeds.
9. **Feed read:** a follower requests their feed → load balancer → app server → **cache
   hit** returns the feed page (photo metadata + CDN URLs); on a miss, the app server
   reads from the **read replica**, populates the cache, and returns it.
10. **Image delivery:** the client fetches image bytes from the **CDN**; on a cache miss
    the CDN pulls from **object storage** and caches at the edge.

---

## 8. Trade-offs

1. **Fan-out on write vs. fan-out on read (feed generation).**
   *Fan-out on write* precomputes each follower's feed when a photo is uploaded — feeds
   are fast to read (great for a read-heavy workload), but a celebrity with millions of
   followers causes a huge write-amplification spike. *Fan-out on read* builds the feed
   at request time — cheap writes, but expensive reads and higher latency.
   **Chosen stance:** hybrid — fan-out on write for normal users, fan-out on read
   (merge at request time) for high-follower accounts.

2. **Strong consistency vs. availability/latency (CAP).**
   Writing metadata to the primary and reading from replicas means a user might briefly
   not see their own new photo in a replica-backed read (replication lag).
   **Chosen stance:** accept **eventual consistency** for feeds (favor availability and
   low latency), but route a user's *own* recent uploads to the primary or cache to give
   read-your-own-writes.

3. **Synchronous vs. asynchronous thumbnail generation.**
   Doing thumbnails inline makes uploads slower and ties up app servers; doing them via
   a queue adds delay before thumbnails are ready (placeholder shown) and requires
   retry/dead-letter handling.
   **Chosen stance:** **asynchronous** — uploads return fast, and the queue absorbs
   spikes (~58 uploads/sec peak) with retries for reliability.

4. **CDN cost vs. origin load/latency.**
   Serving everything from the CDN costs money per egress byte, but serving from origin
   would crush object storage and add latency.
   **Chosen stance:** CDN for all image bytes with long cache TTLs (photos are
   immutable), accepting CDN cost as the price of scale.
