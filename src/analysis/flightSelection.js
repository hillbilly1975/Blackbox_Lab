// ======================================================
// BLACKBOX LAB — FLIGHT SELECTION
// ======================================================
//
// Helpers for choosing a flight out of a multi-flight
// ("Save All Logs") file. The default pick — the longest
// flight — is what Compare Flights always assumed; making
// it a named, tested function lets the comparison flight
// picker preselect the same choice the app used to make
// silently.
//
// ======================================================

export function frameCountOf(flight) {
  return (
    (flight?.stats?.intraFrames ?? 0) +
    (flight?.stats?.interFrames ?? 0)
  );
}

// The longest flight of the file — by decoded frames, so a
// half-written last session never outranks a real flight.
export function longestFlightIndex(flights) {
  if (!Array.isArray(flights) || flights.length === 0) {
    return 0;
  }

  let best = 0;

  for (let index = 1; index < flights.length; index += 1) {
    if (frameCountOf(flights[index]) > frameCountOf(flights[best])) {
      best = index;
    }
  }

  return best;
}
