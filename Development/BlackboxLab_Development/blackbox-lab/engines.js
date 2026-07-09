function avg(vals){return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:NaN;}
function percentile(vals,p){
  if(!vals.length)return NaN;
  const sorted=vals.slice().sort((a,b)=>a-b);
  const i=Math.max(0,Math.min(sorted.length-1,Math.floor(sorted.length*p)));
  return sorted[i];
}

function flightPhaseSamples(samples){
  const heads=samples.map(s=>s.rpm);
  const seed=percentile(heads,0.88);
  const target=Math.round(avg(heads.filter(h=>h>seed*0.92))/10)*10;
  let filtered=samples.filter(s=>s.rpm>=target*0.94&&s.rpm<=target*1.08);
  if(filtered.length<samples.length*0.30){
    filtered=samples.filter(s=>s.rpm>=target*0.90&&s.rpm<=target*1.10);
  }
  return {target,filtered};
}

function governorEngine(samples){
  const {target,filtered}=flightPhaseSamples(samples);
  const rpm=filtered.map(s=>s.rpm);
  const rpmAvg=avg(rpm);
  const min=percentile(rpm,0.01);
  const max=percentile(rpm,0.99);
  const sag=Number.isFinite(min)?Math.max(0,target-min):NaN;
  const sagPct=target>0&&Number.isFinite(sag)?(sag/target)*100:NaN;
  const holdQuality=Number.isFinite(sagPct)?Math.max(0,Math.min(100,100-sagPct*8)):NaN;
  let grade="Unknown";
  if(Number.isFinite(holdQuality)){
    if(holdQuality>=96)grade="Excellent"; else if(holdQuality>=90)grade="Good"; else if(holdQuality>=80)grade="Needs Review"; else grade="Poor";
  }
  return {grade,target,rpmAvg,min,max,sag,holdQuality,evaluatedSamples:filtered.length};
}

function batteryEngine(samples){
  const {filtered}=flightPhaseSamples(samples);
  const volts=filtered.map(s=>s.voltage).filter(Number.isFinite);
  const currents=filtered.map(s=>s.current).filter(Number.isFinite);
  const watts=filtered.map(s=>Number.isFinite(s.voltage)&&Number.isFinite(s.current)?s.voltage*s.current:NaN).filter(Number.isFinite);
  const voltageAvg=avg(volts), voltageMin=volts.length?Math.min(...volts):NaN;
  const currentAvg=avg(currents), currentPeak=percentile(currents,0.99);
  const wattsAvg=avg(watts), wattsPeak=percentile(watts,0.99);
  let grade="Unknown";
  if(Number.isFinite(voltageMin)){
    if(voltageMin>=42)grade="Excellent"; else if(voltageMin>=40.8)grade="Good"; else if(voltageMin>=39.6)grade="Watch"; else grade="Low";
  }
  return {grade,voltageAvg,voltageMin,currentAvg,currentPeak,wattsAvg,wattsPeak};
}

function escEngine(samples){
  const {filtered}=flightPhaseSamples(samples);
  const esc=filtered.map(s=>s.escOutput).filter(x=>Number.isFinite(x)&&x>=0&&x<=120);
  const escAvg=avg(esc), escPeak=percentile(esc,0.99);
  const headroom=Number.isFinite(escPeak)?Math.max(0,100-escPeak):NaN;
  const saturationEvents=esc.filter(e=>e>=95).length;
  const inWindow=esc.filter(e=>e>=70&&e<=85).length;
  const windowPct=esc.length?(inWindow/esc.length)*100:NaN;
  let grade="Unknown";
  if(Number.isFinite(escAvg)&&Number.isFinite(escPeak)){
    if(escAvg>=72&&escAvg<=82&&escPeak<88&&saturationEvents===0)grade="Excellent";
    else if(escAvg>=68&&escAvg<=86&&escPeak<92&&saturationEvents===0)grade="Good";
    else if(escPeak>=95||escAvg>90)grade="Limited";
    else if(escAvg<65)grade="Light Load";
    else grade="Needs Review";
  }
  return {grade,escAvg,escPeak,headroom,saturationEvents,windowPct};
}

function fusionVerdict(gov,bat,esc){
  if(gov.grade==="Poor"||bat.grade==="Low"||esc.grade==="Limited") return "Needs review before changes are made. Check the evidence and avoid guessing.";
  if((gov.grade==="Good"||gov.grade==="Excellent")&&(bat.grade==="Good"||bat.grade==="Excellent")&&(esc.grade==="Good"||esc.grade==="Excellent")) return "System appears well matched. No tuning changes recommended from this pass.";
  return "Analysis complete. More flights will improve confidence.";
}

function buildEngineeringReport(fileName,parsed,gov,bat,esc,verdict){
  return [
    "BLACKBOX LAB v1.0 ENGINEERING REPORT",
    "====================================",
    "",
    "FLIGHT OBJECT",
    "-------------",
    `File: ${fileName}`,
    `Header Row: ${parsed.headerRow}`,
    `Data Rows: ${parsed.dataRows.toLocaleString()}`,
    `Detected Channels: ${parsed.headers.length}`,
    "",
    "GOVERNOR",
    "--------",
    `Grade: ${gov.grade}`,
    `Estimated Target: ${Number.isFinite(gov.target)?Math.round(gov.target)+" RPM":"--"}`,
    `Average Flight Headspeed: ${Number.isFinite(gov.rpmAvg)?Math.round(gov.rpmAvg)+" RPM":"--"}`,
    `Maximum Sag Estimate: ${Number.isFinite(gov.sag)?Math.round(gov.sag)+" RPM":"--"}`,
    `Hold Quality: ${Number.isFinite(gov.holdQuality)?gov.holdQuality.toFixed(1)+"%":"--"}`,
    "",
    "BATTERY",
    "-------",
    `Grade: ${bat.grade}`,
    `Average Voltage: ${Number.isFinite(bat.voltageAvg)?bat.voltageAvg.toFixed(2)+" V":"--"}`,
    `Minimum Voltage: ${Number.isFinite(bat.voltageMin)?bat.voltageMin.toFixed(2)+" V":"--"}`,
    `Average Current: ${Number.isFinite(bat.currentAvg)?bat.currentAvg.toFixed(1)+" A":"--"}`,
    `Peak Current: ${Number.isFinite(bat.currentPeak)?bat.currentPeak.toFixed(1)+" A":"--"}`,
    `Average Watts: ${Number.isFinite(bat.wattsAvg)?Math.round(bat.wattsAvg)+" W":"--"}`,
    `Peak Watts: ${Number.isFinite(bat.wattsPeak)?Math.round(bat.wattsPeak)+" W":"--"}`,
    "",
    "ESC",
    "---",
    `Grade: ${esc.grade}`,
    `Average ESC Output: ${Number.isFinite(esc.escAvg)?esc.escAvg.toFixed(1)+"%":"--"}`,
    `Peak ESC Output: ${Number.isFinite(esc.escPeak)?esc.escPeak.toFixed(1)+"%":"--"}`,
    `ESC Headroom: ${Number.isFinite(esc.headroom)?esc.headroom.toFixed(1)+"%":"--"}`,
    `Efficiency Window: ${Number.isFinite(esc.windowPct)?esc.windowPct.toFixed(1)+"%":"--"}`,
    `Saturation Events: ${esc.saturationEvents}`,
    "",
    "VINCENT VERDICT",
    "---------------",
    verdict
  ].join("\n");
}
