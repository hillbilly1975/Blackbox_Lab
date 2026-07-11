function analyzeAircraftProfile(profile) {
  if (!profile) {
    return {
      score: 40,
      status: "Unknown Aircraft",
      finding:
        "No matching aircraft profile was found. Generic analysis rules will be used."
    };
  }

  return {
    score: 100,
    status: "Profile Matched",
    finding:
      `${profile.displayName} was identified and its aircraft-specific targets were loaded.`
  };
}
export { analyzeAircraftProfile };