let currentReport="";

document.getElementById("fileInput").addEventListener("change",async(event)=>{
  const file=event.target.files[0];
  if(!file)return;
  try{
    document.getElementById("status").innerText="Reading CSV...";
    const text=await file.text();
    const parsed=parseRotorflightCSV(text);
    const gov=governorEngine(parsed.samples);
    const bat=batteryEngine(parsed.samples);
    const esc=escEngine(parsed.samples);
    const verdict=fusionVerdict(gov,bat,esc);
    currentReport=buildEngineeringReport(file.name,parsed,gov,bat,esc,verdict);

    document.getElementById("status").innerText="Analysis complete.";
    document.getElementById("govGrade").innerText=gov.grade;
    document.getElementById("batGrade").innerText=bat.grade;
    document.getElementById("escGrade").innerText=esc.grade;

    document.getElementById("govText").innerText=`Target ${Math.round(gov.target)} RPM, sag ${Math.round(gov.sag)} RPM, hold ${gov.holdQuality.toFixed(1)}%.`;
    document.getElementById("batText").innerText=`Min voltage ${bat.voltageMin.toFixed(2)} V, avg current ${bat.currentAvg.toFixed(1)} A.`;
    document.getElementById("escText").innerText=`Average ${esc.escAvg.toFixed(1)}%, peak ${esc.escPeak.toFixed(1)}%, headroom ${esc.headroom.toFixed(1)}%.`;
    document.getElementById("vincentText").innerText=verdict;
    document.getElementById("report").innerText=currentReport;
    document.getElementById("exportBtn").disabled=false;
  }catch(err){
    document.getElementById("status").innerText="Import failed.";
    document.getElementById("report").innerText=err.message;
  }
});

document.getElementById("exportBtn").addEventListener("click",()=>{
  if(!currentReport)return;
  const blob=new Blob([currentReport],{type:"text/plain"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="BlackboxLab_Engineering_Report.txt";
  a.click();
});
