# Setting up the log ingest endpoint (all in the browser)

The app's "share anonymized logs" feature needs one small piece of
infrastructure: an address it can send contributed logs to. This
guide sets one up on Cloudflare's free tier — no coding tools
needed, everything happens on the Cloudflare website.

The feature stays completely dormant in the app until the address
is filled in (step 4), so there's no rush: the app works fine
without it.

## Step 1 — Create a Cloudflare account (if you don't have one)

Go to dash.cloudflare.com, sign up (free plan is plenty).

## Step 2 — Create the storage bucket

1. In the left sidebar: **R2 Object Storage** → **Create bucket**.
2. Name it `blackbox-logs`, leave everything else default, create.
   (Buckets are PRIVATE by default — only you can read them.
   Free tier includes 10 GB, which holds thousands of logs.)

## Step 3 — Create the worker (the receiving address)

1. Left sidebar: **Workers & Pages** → **Create Application** →
   stay on the **Workers** tab → **Create Worker** (the plain
   "Hello World" starter is the right choice if templates appear).
2. Name it `blackbox-ingest` and **Deploy** the placeholder it
   suggests — that's expected.
3. Click **Edit code**, delete everything, and paste the whole
   contents of `Documentation/ingest-worker.js` from this repo.
   Click **Deploy**.
4. Back on the worker's page: **Settings** → **Bindings** →
   **Add binding** → **R2 bucket**. Variable name: `LOGS`,
   bucket: `blackbox-logs`. Save.
5. The worker's address is shown at the top — something like
   `https://blackbox-ingest.<your-name>.workers.dev`. Copy it.
   Opening it in a browser should show "Blackbox Lab ingest" —
   that's how you know it's alive.

## Step 4 — Tell the app about it

In the repo, edit `src/contribute/config.js` (this can be done on
GitHub in the browser: open the file, click the pencil) and put the
worker address between the quotes:

    export const CONTRIBUTE_ENDPOINT =
      "https://blackbox-ingest.<your-name>.workers.dev";

Commit the change and publish a new release — from that version on,
the app asks pilots on first launch and contributed logs start
arriving in your bucket.

## Reading the collected logs

R2 → `blackbox-logs` → files are grouped by date, one JSON file
(gzipped) per contributed flight. Download from the browser, or ask
for tooling to analyze them in bulk once there's a pile.

## Costs and abuse

Free tier: 10 GB storage, 1M requests/day — hobby scale fits with
huge room. The worker accepts at most 40 MB per upload and stores
nothing about the sender (no IP, no account) — the payload is all
there is. If someone ever abuses the address, rotating it is:
rename the worker, update config.js, release.
