function parseCSVLine(line){
  const result=[]; let cur=""; let inQuotes=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch === '"'){
      if(inQuotes && line[i+1] === '"'){cur+='"'; i++;}
      else inQuotes=!inQuotes;
    } else if(ch === "," && !inQuotes){
      result.push(cur.trim()); cur="";
    } else cur+=ch;
  }
  result.push(cur.trim());
  return result;
}

function detectHeaderRow(lines){
  const keys=["time","loopiteration","headspeed","rpm","vbat","esc","gyro","motor","servo"];
  for(let i=0;i<Math.min(lines.length,180);i++){
    const row=parseCSVLine(lines[i]).filter(x=>x.length>0);
    if(row.length<5) continue;
    const joined=row.join(" ").toLowerCase();
    let score=0;
    keys.forEach(k=>{if(joined.includes(k)) score++;});
    if(score>=2) return {index:i, headers:row};
  }
  return null;
}

function findColumn(headers,candidates){
  const lows=headers.map(h=>h.toLowerCase());
  for(const c of candidates){
    const idx=lows.findIndex(h=>h===c.toLowerCase());
    if(idx>=0) return idx;
  }
  for(const c of candidates){
    const idx=lows.findIndex(h=>h.includes(c.toLowerCase()));
    if(idx>=0) return idx;
  }
  return -1;
}

function toNumber(v){
  if(v===undefined||v===null) return NaN;
  const n=parseFloat(String(v).replace(/[^0-9eE+\-.]/g,""));
  return Number.isFinite(n)?n:NaN;
}
function scaleVoltage(v){if(!Number.isFinite(v))return NaN;if(v>1000)return v/100;if(v>100)return v/10;return v;}
function scalePercent(v){if(!Number.isFinite(v))return NaN;if(v>1000)return v/10;if(v>100)return v/10;return v;}
function scaleCurrent(v){if(!Number.isFinite(v))return NaN;if(v>1000)return v/100;if(v>300)return v/10;return v;}

function parseRotorflightCSV(text){
  const lines=text.split(/\r?\n/).filter(x=>x.trim().length>0);
  const header=detectHeaderRow(lines);
  if(!header) throw new Error("Could not detect RotorFlight telemetry header row.");

  const headers=header.headers;
  const col={
    rpm:findColumn(headers,["headspeed","EscRPM","Esc2RPM","rpm"]),
    volt:findColumn(headers,["Vbat","EscV","voltage","Vbec"]),
    esc:findColumn(headers,["EscThr","EscPwm","EscCap"]),
    current:findColumn(headers,["EscI","Esc2I","Ibat","current"])
  };

  const samples=[];
  for(let i=header.index+1;i<lines.length;i++){
    const r=parseCSVLine(lines[i]);
    const rpm=col.rpm>=0?toNumber(r[col.rpm]):NaN;
    if(!Number.isFinite(rpm)||rpm<100) continue;
    samples.push({
      rpm,
      voltage:col.volt>=0?scaleVoltage(toNumber(r[col.volt])):NaN,
      escOutput:col.esc>=0?scalePercent(toNumber(r[col.esc])):NaN,
      current:col.current>=0?scaleCurrent(toNumber(r[col.current])):NaN
    });
  }

  return {headerRow:header.index, headers, columns:col, dataRows:lines.length-header.index-1, samples};
}
