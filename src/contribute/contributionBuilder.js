// ======================================================
// BLACKBOX LAB — CONTRIBUTION BUILDER
//
// Turns a decoded flight into the anonymized payload that
// "Share anonymized logs" uploads. Strict ALLOWLIST design:
// nothing leaves the machine unless a rule here names it.
//
// Privacy properties (tested in test/contribution.test.mjs):
//   - no craft name unless the Setup category is enabled
//   - no board information, no log date/time, ever
//   - GPS is opt-in and RELATIVE only: track shape, speed
//     and altitude survive; the pilot's location does not
//   - unknown/unlisted fields are dropped, not forwarded
// ======================================================

const CORE_MAIN_FIELDS =
  /^(time|loopIteration|gyro|setpoint|axis[PIDF]|rcCommand|motor\[|servo|headspeed|govTarget|rssi|debug)/;

const POWER_MAIN_FIELDS =
  /^(Vbat|vbatLatest|Ibat|amperage|Esc|current|energy|mAh)/i;

const SLOW_FIELDS = /flag|failsafe|rx/i;

// Tuning headers that describe the SETUP, not the pilot.
const SETUP_HEADERS =
  /^(gyro_|dterm_|d_min|rpm_|gov_|motor_poles|motor_pole|gear_ratio|rates|rc_rates|rc_expo|rollPID|pitchPID|yawPID|levelPID|filter|dyn_notch|acc_|pid_process_denom|looptime)/;

// One degree of latitude ≈ 111,320 m; coordinates arrive as
// degrees × 1e7, so one raw unit ≈ 1.11 cm.
const METERS_PER_1E7_DEG_LAT = 0.0111320;

function pickColumns(fieldNames, keepIndex) {
  const indices = [];
  const names = [];

  fieldNames.forEach((name, i) => {
    if (keepIndex(name)) {
      indices.push(i);
      names.push(name);
    }
  });

  return { indices, names };
}

function projectFrames(frames, indices) {
  return frames.map((frame) => indices.map((i) => frame[i]));
}

// GPS frames become a relative track: every coordinate is an
// offset in meters from the FIRST fix of the flight. Absolute
// coordinates never enter the payload.
function buildRelativeGps(flight) {
  const nameHeader = flight.headers?.get?.("Field G name");

  if (!nameHeader || !flight.gpsFrames || flight.gpsFrames.length === 0) {
    return null;
  }

  const gpsNames = nameHeader.split(",");
  const latIndex = gpsNames.indexOf("GPS_coord[0]");
  const lonIndex = gpsNames.indexOf("GPS_coord[1]");
  const altIndex = gpsNames.indexOf("GPS_altitude");

  const passThrough = ["GPS_speed", "GPS_ground_course", "GPS_numSat"]
    .map((name) => ({ name, index: gpsNames.indexOf(name) }))
    .filter((entry) => entry.index >= 0);

  const first = flight.gpsFrames[0].values;
  const lat0 = latIndex >= 0 ? first[latIndex] : 0;
  const lon0 = lonIndex >= 0 ? first[lonIndex] : 0;
  const alt0 = altIndex >= 0 ? first[altIndex] : 0;
  const metersPerLon =
    METERS_PER_1E7_DEG_LAT * Math.cos((lat0 * 1e-7 * Math.PI) / 180);

  const fields = ["afterMainFrame"];
  if (latIndex >= 0) fields.push("rel_north_m");
  if (lonIndex >= 0) fields.push("rel_east_m");
  if (altIndex >= 0) fields.push("rel_altitude");
  passThrough.forEach((entry) => fields.push(entry.name));

  const frames = flight.gpsFrames.map((gps) => {
    const row = [gps.afterMainFrame];

    if (latIndex >= 0) {
      row.push(
        Math.round((gps.values[latIndex] - lat0) * METERS_PER_1E7_DEG_LAT * 10) /
          10
      );
    }
    if (lonIndex >= 0) {
      row.push(
        Math.round((gps.values[lonIndex] - lon0) * metersPerLon * 10) / 10
      );
    }
    if (altIndex >= 0) {
      row.push(gps.values[altIndex] - alt0);
    }
    passThrough.forEach((entry) => row.push(gps.values[entry.index]));

    return row;
  });

  return { fields, frames };
}

function buildSetupInfo(flight, includeSetup) {
  const sysConfig = flight.sysConfig ?? {};
  const info = {
    firmwareType: sysConfig.firmwareType ?? null,
    firmwareRevision: sysConfig.firmwareRevision ?? null
  };

  if (includeSetup) {
    info.craftName = sysConfig.craftName ?? null;

    const tuning = {};
    if (flight.headers?.forEach) {
      flight.headers.forEach((value, key) => {
        if (SETUP_HEADERS.test(key)) {
          tuning[key] = value;
        }
      });
    }
    info.tuning = tuning;
  }

  return info;
}

/**
 * Build the anonymized contribution payload.
 *
 * @param {object} flight    decoded flight (bblDecoder shape)
 * @param {string} fileType  e.g. "Blackbox BBL Log"
 * @param {object} categories { power, gps, setup } booleans —
 *                            core flight data is always included
 * @param {string} appVersion
 */
export function buildContribution(flight, fileType, categories, appVersion) {
  const keep = (name) =>
    CORE_MAIN_FIELDS.test(name) ||
    (categories.power === true && POWER_MAIN_FIELDS.test(name));

  const main = pickColumns(flight.mainFieldNames ?? [], keep);
  const slow = pickColumns(flight.slowFieldNames ?? [], (name) =>
    SLOW_FIELDS.test(name)
  );

  const payload = {
    schema: 1,
    app: appVersion ?? null,
    source: fileType,
    durationSeconds: flight.durationSeconds ?? null,
    categories: {
      power: categories.power === true,
      gps: categories.gps === true,
      setup: categories.setup === true
    },
    setup: buildSetupInfo(flight, categories.setup === true),
    fields: main.names,
    frames: projectFrames(flight.mainFrames ?? [], main.indices),
    slow: {
      fields: slow.names,
      frames: (flight.slowFrames ?? []).map((entry) => ({
        afterMainFrame: entry.afterMainFrame,
        values: slow.indices.map((i) => entry.values[i])
      }))
    }
  };

  if (categories.gps === true) {
    const gps = buildRelativeGps(flight);
    if (gps) {
      payload.gps = gps;
    }
  }

  return payload;
}

/**
 * Human summary for the consent UI: what WOULD be shared.
 */
export function describeContribution(payload) {
  const parts = [
    `${payload.fields.length} flight-data channels, ${payload.frames.length.toLocaleString()} frames`
  ];

  if (payload.gps) {
    parts.push("GPS as relative track + speed (never your location)");
  }
  if (payload.categories.setup) {
    parts.push("setup info (model + tuning values)");
  }

  return parts.join(" · ");
}
