const aircraftProfiles = {
  "bell 222ut": {
    displayName: "Bell 222UT",
    motor: "Egodrift 3220HS 1100KV",
    esc: "Hobbywing Platinum 80A V4",
    battery: "SMC 6S 4000mAh HV",
    weightLb: 7.6,
    mainGearRatio: 11.17,
    tailRatio: 3.83,
    mainBladeCount: 2,
tailBladeCount: 2,
motorPoleCount: 10,
    targetEscOutput: "78-80%",
    notes: "Scale Bell 222UT test bed"
  },

  "md500e": {
    displayName: "MD500E",
    motor: "Egodrift 4230EC 370KV",
    esc: "Hobbywing Platinum 260A-HV V5",
    battery: "SMC 12S 6200mAh HV",
    weightLb: 17.43,
    mainGearRatio: 9.33,
    tailRatio: 5.25,
    targetEscOutput: "78-80%",
    notes: "700-size scale MD500E"
  }
};

export { aircraftProfiles };