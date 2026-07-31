// ======================================================
// BLACKBOX LAB — CONTRIBUTION CONFIG
//
// The community ingest endpoint. Leave EMPTY to keep the
// whole sharing feature dormant (no ask, no uploads) —
// fill it in once the endpoint exists. Setup guide:
// Documentation/ingest-endpoint-setup.md
// ======================================================

export const CONTRIBUTE_ENDPOINT =
  "https://blackbox-ingest.dlsinkjr22.workers.dev/";

// Reported inside the payload so contributed logs can be
// grouped by app version. Taken from the app's own version
// so the two can never drift apart.
import { APP_VERSION } from "../version.js";

export const CONTRIBUTE_APP_VERSION = APP_VERSION;
