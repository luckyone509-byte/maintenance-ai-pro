// Production deployment auth: for same-origin /api requests, attach the private access key.
// The key is stored only in this browser's localStorage and is never written into the app bundle.
(() => {
  const rawFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const sameApi = url.startsWith('/api/') || url.startsWith(location.origin + '/api/');
    if (!sameApi) return rawFetch(input, init);
    const doRequest = (token) => {
      const next = {...init};
      const headers = new Headers(next.headers || (typeof input !== 'string' && input.headers) || {});
      if (token) headers.set('Authorization', 'Bearer ' + token);
      next.headers = headers;
      return rawFetch(input, next);
    };
    let token = localStorage.getItem('maint_ai_api_token') || '';
    let response = await doRequest(token);
    if (response.status === 401) {
      const entered = prompt('Maintenance AI Pro access key:');
      if (entered) {
        token = entered.trim();
        localStorage.setItem('maint_ai_api_token', token);
        response = await doRequest(token);
        if (response.status === 401) localStorage.removeItem('maint_ai_api_token');
      }
    }
    return response;
  };
})();


const $ = id => document.getElementById(id);

const fieldsByTrade = {
  HVAC: [
    ["voltage","Supply Voltage","V"],["control_voltage","Control Voltage","VAC"],["rla","RLA Nameplate","A"],["running_amps","Running Amps","A"],
    ["lra","LRA","A"],["low_psig","Low Side","psig"],["high_psig","High Side","psig"],["evap_sat","Evap Sat Temp","°F"],
    ["cond_sat","Cond Sat Temp","°F"],["suction_temp","Suction Line Temp","°F"],["liquid_temp","Liquid Line Temp","°F"],
    ["superheat","Superheat","°F"],["subcooling","Subcooling","°F"],["return_temp","Return Air","°F"],["supply_temp","Supply Air","°F"],
    ["delta_t","ΔT","°F"],["drier_in_temp","Filter-Drier Inlet Temp","°F"],["drier_out_temp","Filter-Drier Outlet Temp","°F"],
    ["drier_delta_t","Filter-Drier Temp Drop (Auto)","°F"],["static_pressure","Total Static","in. w.c."],["cap_rating","Cap Rating","µF"],["cap_actual","Cap Actual","µF"]
  ],
  Electrical: [["line_voltage","Line Voltage","V"],["hot_neutral","Hot-Neutral","V"],["hot_ground","Hot-Ground","V"],["neutral_ground","Neutral-Ground","V"],["load_amps","Load Current","A"],["resistance","Resistance","Ω"]],
  Plumbing: [["static_water","Static Pressure","psi"],["flow_water","Flow Pressure","psi"],["hot_temp","Hot Water Temp","°F"],["drain_time","Drain Time","sec"]],
  Refrigerator: [["supply_voltage","Supply Voltage","V"],["freezer_temp","Freezer Temp","°F"],["fresh_temp","Fresh Food Temp","°F"],["compressor_amps","Compressor Amps","A"],["thermistor_ohms","Thermistor","Ω"],["evap_fan_voltage","Evap Fan Voltage","V"]],
  Washer: [["supply_voltage","Supply Voltage","V"],["valve_ohms","Valve Resistance","Ω"],["motor_amps","Motor Amps","A"],["drain_voltage","Drain Pump Voltage","V"]],
  Dryer: [["supply_voltage","Supply Voltage","V"],["l1_l2","L1-L2","V"],["element_ohms","Element Resistance","Ω"],["motor_amps","Motor Amps","A"],["exhaust_temp","Exhaust Temp","°F"]],
  Dishwasher: [["supply_voltage","Supply Voltage","V"],["heater_ohms","Heater Resistance","Ω"],["drain_voltage","Drain Pump Voltage","V"],["fill_valve_ohms","Fill Valve Resistance","Ω"]],
  "Water Heater": [["supply_voltage","Supply Voltage","V"],["upper_element_ohms","Upper Element","Ω"],["lower_element_ohms","Lower Element","Ω"],["upper_amps","Upper Element Amps","A"],["lower_amps","Lower Element Amps","A"]],
  "Building System": [["supply_voltage","Supply Voltage","V"],["control_voltage","Control Voltage","V"],["load_amps","Load Current","A"]],
  Other: [["voltage","Voltage","V"],["amps","Current","A"],["resistance","Resistance","Ω"],["temperature","Temperature","°F"],["pressure","Pressure","psi"]]
};

function renderMeasurements(){
  const trade = $("trade").value;
  const wrap = $("measurementFields");
  wrap.innerHTML = "";
  (fieldsByTrade[trade] || fieldsByTrade.Other).forEach(([id,label,unit])=>{
    const el = document.createElement("label");
    const computed = id === "drier_delta_t";
    el.innerHTML = `${label}<input inputmode="decimal" data-measure="${id}" placeholder="${computed ? `Auto ${unit}` : unit}"${computed ? ' readonly aria-readonly="true" class="computed-measurement" title="Calculated from the filter-drier inlet and outlet temperatures"' : ""}>`;
    wrap.appendChild(el);
  });
}

function updateDrierDrop(){
  const inlet=document.querySelector('[data-measure="drier_in_temp"]');
  const outlet=document.querySelector('[data-measure="drier_out_temp"]');
  const drop=document.querySelector('[data-measure="drier_delta_t"]');
  if(!inlet || !outlet || !drop) return;
  if(inlet.value==="" || outlet.value==="") { drop.value=""; return; }
  const a=Number(inlet.value), b=Number(outlet.value);
  drop.value=Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a-b).toFixed(1) : "";
}
$('measurementFields').addEventListener('input',e=>{
  if(e.target.matches('[data-measure="drier_in_temp"], [data-measure="drier_out_temp"]')) updateDrierDrop();
});
$("trade").addEventListener("change", renderMeasurements);
renderMeasurements();

document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
    btn.classList.add("active"); $(btn.dataset.tab).classList.add("active");
  });
});
function goTab(id){ document.querySelector(`.tab[data-tab="${id}"]`).click(); }

$("dataPlatePhoto").addEventListener("change", e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader(); r.onload=()=>{ $("photoPreview").src=r.result; $("photoPreview").classList.remove("hidden"); localStorage.setItem("lastPlateImage", r.result); };
  r.readAsDataURL(f);
});

$("techSheet").addEventListener("change", e=>{
  const f=e.target.files[0];
  $("techSheetInfo").textContent = f ? `Attached: ${f.name} • ${(f.size/1024/1024).toFixed(2)} MB` : "No tech sheet attached.";
  if(f) localStorage.setItem("lastTechSheetName",f.name);
});

function measurements(){
  const o={};
  document.querySelectorAll("[data-measure]").forEach(i=>{ if(i.value!=="") o[i.dataset.measure]=Number(i.value); });
  return o;
}
function val(m,k){ return Number.isFinite(m[k]) ? m[k] : null; }
function has(m,...ks){ return ks.every(k=>Number.isFinite(m[k])); }

function diagnoseHVAC(c,m){
  let candidates=[];
  const sh=val(m,"superheat"), sc=val(m,"subcooling"), dt=val(m,"delta_t"), run=val(m,"running_amps"), rla=val(m,"rla"), stat=val(m,"static_pressure"), drierDt=val(m,"drier_delta_t");
  if(sh!==null && sc!==null){
    if(sh>=20 && sc<=5) candidates.push({title:"Likely low refrigerant charge / refrigerant loss",score:82,support:[`High superheat (${sh}°F)`,`Low subcooling (${sc}°F)`],conflict:["Confirm airflow before charging","Leak confirmation still required"],next:"Check evaporator airflow, then leak-search and verify weighed charge.",disproof:"If airflow is normal and refrigerant charge by weight is correct, low-charge diagnosis is disproved."});
    if(sh>=20 && sc>=15){
      const drierConfirmed=drierDt!==null && drierDt>=3;
      const support=[`High superheat (${sh}°F)`,`High subcooling (${sc}°F)`];
      if(drierDt!==null) support.push(`Filter-drier temperature drop (${drierDt}°F)`);
      candidates.push({
        title:drierConfirmed ? "Likely restricted liquid-line filter drier" : "Likely refrigerant restriction",
        score:drierConfirmed ? 94 : 88,
        support,
        conflict:drierConfirmed ? ["Confirm the temperature drop with secure, insulated probe contact"] : drierDt!==null ? [`Filter-drier drop is only ${drierDt}°F — check the metering device for the restriction`] : ["Need filter-drier inlet and outlet temperatures to help locate the restriction"],
        next:drierConfirmed ? "Repeat the filter-drier inlet/outlet test with stabilized, insulated probes, then confirm metering-device feed before opening the system." : "Measure filter-drier inlet/outlet temperatures and check metering-device feed.",
        disproof:drierConfirmed ? "A repeatable drop below 3°F with normal metering-device feed would argue against a filter-drier restriction." : "If no pressure/temperature drop exists across the suspect restriction and the metering device feeds normally, restriction is unlikely."
      });
    }
    if(sh<=5 && sc>=15) candidates.push({title:"Possible overcharge or evaporator overfeeding",score:73,support:[`Low superheat (${sh}°F)`,`High subcooling (${sc}°F)`],conflict:["Airflow and metering-device behavior can mimic this"],next:"Verify airflow first, then compare charge to manufacturer charging method.",disproof:"Normal charge by weight with normal airflow shifts suspicion toward metering-device overfeed."});
    if(sh<=5 && sc>=7 && sc<=14) candidates.push({title:"Evaporator may be overfed / low heat load",score:64,support:[`Low superheat (${sh}°F)`,`Subcooling not clearly low (${sc}°F)`],conflict:["Need indoor load and airflow evidence"],next:"Check return-air temperature, blower speed, filter/coil condition, and metering control.",disproof:"Normal indoor load and stable target superheat would disprove overfeed."});
  }
  if(drierDt!==null && drierDt>=3 && !(sh!==null && sc!==null && sh>=20 && sc>=15)) candidates.push({title:"Possible liquid-line filter-drier restriction",score:78,support:[`Filter-drier temperature drop (${drierDt}°F)`],conflict:["Need stabilized superheat and subcooling to confirm system impact"],next:"Confirm probe contact, then record stabilized superheat and subcooling and inspect metering-device feed.",disproof:"A repeatable drop below 3°F with normal refrigerant feeding would argue against a filter-drier restriction."});
  if(dt!==null && dt<14) candidates.push({title:"Low cooling capacity — airflow, refrigerant, or compressor issue",score:58,support:[`Low ΔT (${dt}°F)`],conflict:["ΔT alone does not identify root cause"],next:"Separate airflow from refrigeration using SH/SC, saturation temperatures, and amp draw.",disproof:"A normal stabilized 16–22°F ΔT under normal humidity/load reduces likelihood of a capacity fault."});
  if(run!==null && rla!==null && run < rla*0.45) candidates.push({title:"Possible weak / non-pumping compressor",score:76,support:[`Running amps ${run} A are far below RLA ${rla} A`],conflict:["Must correlate with compression/pressure differential"],next:"Check suction/discharge pressure differential and equalization behavior.",disproof:"Normal pressure differential and capacity would disprove a pumping failure."});
  if(stat!==null && stat>0.8) candidates.push({title:"High external static pressure / airflow restriction",score:84,support:[`Total external static ${stat} in. w.c. is high`],conflict:["Equipment rated maximum static should be confirmed"],next:"Check filter, coil, return/supply restrictions, dampers, and blower setup.",disproof:"Static below equipment maximum with correct airflow disproves excessive-static diagnosis."});
  if(/freeze|frozen|ice/i.test(c) && (stat===null || stat>0.5)) candidates.push({title:"Airflow problem remains a priority freeze-up cause",score:62,support:["Complaint indicates evaporator freezing"],conflict:["Need measured airflow/static or refrigeration evidence"],next:"Verify filter, evaporator cleanliness, blower operation/speed, registers, and static pressure.",disproof:"Confirmed normal airflow plus refrigerant evidence shifts diagnosis away from airflow."});
  return candidates;
}

function genericDiagnosis(trade,c,m){
  const count=Object.keys(m).length;
  if(trade==="Electrical"){
    if(has(m,"hot_neutral","hot_ground") && m.hot_neutral<20 && m.hot_ground>100) return [{title:"Likely open / loose neutral",score:90,support:[`Hot-neutral ${m.hot_neutral} V`,`Hot-ground ${m.hot_ground} V`],conflict:["Confirm upstream neutral connection"],next:"Trace neutral continuity and voltage drop upstream with power isolated where required.",disproof:"A solid neutral path with normal hot-neutral voltage disproves an open-neutral condition."}];
  }
  if(trade==="Water Heater" && has(m,"lower_amps") && m.lower_amps<1) return [{title:"Lower element is not drawing current",score:80,support:[`Lower element current ${m.lower_amps} A`],conflict:["Could be open element, thermostat not sending power, or satisfied call"],next:"Verify 240 V at lower element during an active lower-element call, then power-off resistance test.",disproof:"Normal voltage and expected current during call disproves the fault."}];
  return [{title:`Insufficient evidence for a confident ${trade} diagnosis`,score:Math.min(45,20+count*5),support:count?[`${count} measured value(s) entered`]:["Complaint captured"],conflict:["More targeted evidence is needed"],next:"Use the tool bag and tech sheet to capture the next discriminating measurement.",disproof:"Not applicable — diagnosis is intentionally withheld until evidence improves."}];
}

function runEngine(){
  const trade=$("trade").value,c=$("complaint").value.trim(),m=measurements();
  let cands = trade==="HVAC" ? diagnoseHVAC(c,m) : genericDiagnosis(trade,c,m);
  if(!cands.length) cands=genericDiagnosis(trade,c,m);
  cands.sort((a,b)=>b.score-a.score);
  const d=cands[0];
  $("diagnosisTitle").textContent=d.title;
  $("diagnosisReason").textContent=`Based on the complaint and the strongest discriminating evidence currently entered.`;
  $("confidenceText").textContent=d.score+"%"; $("confidenceBar").style.width=d.score+"%";
  $("nextTest").textContent=d.next; $("disproof").textContent=d.disproof;
  $("supportEvidence").innerHTML=d.support.map(x=>`<li>${x}</li>`).join("");
  $("conflictEvidence").innerHTML=d.conflict.map(x=>`<li>${x}</li>`).join("");
  renderChecklist(trade);
  renderToolBag(trade);
  localStorage.setItem("lastDiagnosis",JSON.stringify(d));
  goTab("diagnosis");
}
$("runDiagnosis").addEventListener("click",runEngine);

function renderChecklist(trade){
  const common=["Complaint reproduced or conditions documented","Power/control inputs verified","Readings recorded before repair","Failure isolated to component/system — not guessed","Repair verified under normal operation","Area left safe and clean"];
  if(trade==="HVAC") common.splice(3,0,"Airflow checked before refrigerant adjustment","SH/SC interpreted using correct metering-device method");
  $("verificationChecklist").innerHTML=common.map(x=>`<label class="check-item"><input type="checkbox"> ${x}</label>`).join("");
}
renderChecklist("HVAC");

const toolBags={
  HVAC:[["Meter","Voltage, continuity, resistance, control signal"],["Clamp Meter","RLA/LRA/running current"],["Manifold / Probes","Pressures, saturation, SH/SC"],["Temperature Probes","Line temps, ΔT, drier drop"],["Static Kit","TESP and duct restrictions"],["Micron Gauge","Evacuation verification"]],
  Electrical:[["Multimeter","Voltage, continuity, resistance"],["Clamp Meter","Load current"],["Receptacle/GFCI Tester","Fast branch-circuit screening"],["Non-contact Tester","Presence check only — confirm with meter"]],
  Plumbing:[["Pressure Gauge","Static/flow pressure"],["Thermometer","Hot-water delivery"],["Inspection Camera","Drain/line inspection"],["Hand Auger/Snake","Fixture stoppages"]],
  Refrigerator:[["Multimeter","Power, components, thermistors"],["Clamp Meter","Compressor current"],["Thermometer","Compartment temps"],["Service Data","Diagnostic mode and expected resistance"]],
  Washer:[["Multimeter","Valve, pump, lock, motor circuits"],["Clamp Meter","Motor/load current"],["Service Data","Error codes / test mode"]],
  Dryer:[["Multimeter","240 V supply, element, limits"],["Clamp Meter","Element/motor current"],["Thermometer","Exhaust cycling temp"]],
  Dishwasher:[["Multimeter","Supply, heater, valves, pumps"],["Service Data","Diagnostic mode / codes"],["Inspection","Float, drain path, leaks"]],
  "Water Heater":[["Multimeter","240 V, thermostat/element"],["Clamp Meter","Element current"],["Thermometer","Delivered water temp"]],
  "Building System":[["Multimeter","Power/control circuits"],["Clamp Meter","Load current"],["Documentation","Sequence of operation"]]
};
function renderToolBag(trade){
  $("toolBag").innerHTML=(toolBags[trade]||toolBags.HVAC).map(([a,b])=>`<div class="tool-card"><strong>${a}</strong><span>${b}</span></div>`).join("");
}
renderToolBag("HVAC");
$("trade").addEventListener("change",()=>renderToolBag($("trade").value));

$("youtubeSearch").addEventListener("click",()=>{
  const q=[ $("manufacturer").value, $("model").value, $("complaint").value, "diagnosis repair" ].filter(Boolean).join(" ");
  const url="https://www.youtube.com/results?search_query="+encodeURIComponent(q);
  $("youtubeLink").href=url; $("youtubeLink").textContent=`Search YouTube: ${q || "maintenance diagnosis"}`; $("youtubeLink").classList.remove("hidden");
});

$("manualAssist").addEventListener("click",()=>{
  const q=$("manualQuestion").value.trim()||"Find the diagnostic procedure, error code information, and expected test values.";
  const name=localStorage.getItem("lastTechSheetName")||"attached tech sheet";
  $("manualPrompt").value=`Asset: ${$("manufacturer").value} ${$("model").value}\nManual: ${name}\nQuestion: ${q}\n\nAnswer only from the service data. Include page/section references and exact expected values when available.`;
});

$("generateNote").addEventListener("click",()=>{
  const complaint=$("complaint").value.trim();
  let d={title:"issue diagnosed"}; try{d=JSON.parse(localStorage.getItem("lastDiagnosis"))||d}catch{}
  const repair=$("repairPerformed").value.trim()||"Corrective action completed";
  const verify=$("verification").value.trim()||"System tested after repair and is operating properly";
  $("closingNote").value=`Diagnosed ${complaint ? complaint.toLowerCase() : "reported issue"} and found ${d.title.toLowerCase()}. ${repair}. ${verify}.`;
});
$("copyNote").addEventListener("click", async()=>{ try{await navigator.clipboard.writeText($("closingNote").value); $("saveStatus").textContent="Note copied";}catch{} });

function currentCase(){
  return {
    id:Date.now(),timestamp:new Date().toISOString(),trade:$("trade").value,complaint:$("complaint").value,
    manufacturer:$("manufacturer").value,model:$("model").value,serial:$("serial").value,location:$("location").value,
    measurements:measurements(),observations:$("observations").value,
    diagnosis:JSON.parse(localStorage.getItem("lastDiagnosis")||"null"),
    repair:$("repairPerformed").value,verification:$("verification").value,note:$("closingNote").value,
    techSheetName:localStorage.getItem("lastTechSheetName")||null
  };
}
async function apiCases(method="GET",body=null,path="/api/cases"){
  const opts={method,headers:{"Content-Type":"application/json"}}; if(body)opts.body=JSON.stringify(body);
  const r=await fetch(path,opts); const j=await r.json(); if(!r.ok||!j.ok)throw new Error(j.error||"Case API failed"); return j;
}
async function loadPersistentCases(){
  try{
    const j=await apiCases(); localStorage.setItem("cases",JSON.stringify(j.cases||[])); return j.cases||[];
  }catch(e){ return JSON.parse(localStorage.getItem("cases")||"[]"); }
}
$("saveCase").addEventListener("click",async()=>{
  const c=currentCase();
  try{
    const j=await apiCases("POST",c);
    const list=await loadPersistentCases();
    $("saveStatus").textContent="Case saved to persistent database"; renderHistory(list); goTab("history");
  }catch(e){
    const list=JSON.parse(localStorage.getItem("cases")||"[]"); list.unshift(c); localStorage.setItem("cases",JSON.stringify(list));
    $("saveStatus").textContent="Server unavailable — case saved on this device"; renderHistory(list); goTab("history");
  }
});
function renderHistory(list=null){
  list=list||JSON.parse(localStorage.getItem("cases")||"[]");
  $("historyList").innerHTML=list.length?list.map(x=>`<div class="history-item"><strong>${escapeHtml(x.trade||"Case")}: ${escapeHtml(x.complaint||"No complaint")}</strong><div>${x.diagnosis?escapeHtml(x.diagnosis.title):"No diagnosis saved"}</div><div>${x.repair?`<b>Repair:</b> ${escapeHtml(x.repair)}`:""}</div><div class="meta">${new Date(x.timestamp||x.created_at).toLocaleString()} • ${escapeHtml([x.manufacturer,x.model,x.location].filter(Boolean).join(" • "))}</div></div>`).join(""):`<div class="resource-box">No saved cases yet.</div>`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
loadPersistentCases().then(renderHistory);

$("exportHistory").addEventListener("click",()=>{
  const blob=new Blob([localStorage.getItem("cases")||"[]"],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="maintenance-ai-cases.json"; a.click(); URL.revokeObjectURL(a.href);
});

function voiceInto(target){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert("Voice recognition is not supported in this browser.");return;}
  const r=new SR(); r.lang="en-US"; r.interimResults=false; r.maxAlternatives=1;
  r.onresult=e=>{ target.value += (target.value?" ":"")+e.results[0][0].transcript; };
  r.start();
}
$("voiceComplaint").addEventListener("click",()=>voiceInto($("complaint")));
$("voiceMeasurement").addEventListener("click",()=>{
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert("Voice recognition is not supported in this browser.");return;}
  const r=new SR(); r.lang="en-US"; r.onresult=e=>{
    $("observations").value += ($("observations").value?" ":"")+"Voice reading: "+e.results[0][0].transcript;
  }; r.start();
});

$("clearCase").addEventListener("click",()=>{
  ["complaint","manufacturer","model","serial","location","observations","repairPerformed","verification","closingNote"].forEach(id=>$(id).value="");
  document.querySelectorAll("[data-measure]").forEach(i=>i.value="");
  $("photoPreview").classList.add("hidden"); localStorage.removeItem("lastDiagnosis");
});



// --- V1.1 SMART SCAN + TECH-SHEET INDEXING ---
let manualText = "";
let manualFile = null;

function normalizeOCR(t){
  return String(t||"").replace(/[|]/g,"I").replace(/\s+/g," ").trim();
}
function extractIdentifier(text, labels){
  const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const labelPattern=labels.join("|");
  for(const line of lines){
    const m=line.match(new RegExp(`(?:${labelPattern})\\s*(?:NO\\.?|NUMBER|#|:)??\\s*[:#-]?\\s*([A-Z0-9][A-Z0-9._\\/-]{3,24})`,`i`));
    if(m) return m[1].replace(/[.,;:]$/,'');
  }
  const joined=normalizeOCR(text);
  const m=joined.match(new RegExp(`(?:${labelPattern})\\s*(?:NO\\.?|NUMBER|#|:)??\\s*[:#-]?\\s*([A-Z0-9][A-Z0-9._\\/-]{3,24})`,`i`));
  return m?m[1].replace(/[.,;:]$/,''):"";
}
function inferManufacturer(text){
  const brands=["GE","GENERAL ELECTRIC","FRIGIDAIRE","ELECTROLUX","WHIRLPOOL","MAYTAG","AMANA","KITCHENAID","SAMSUNG","LG","BOSCH","HOTPOINT","HAIER","CARRIER","GOODMAN","TRANE","LENNOX","RHEEM","RUUD","YORK","ICP","BRYANT","PAYNE"];
  const u=String(text||"").toUpperCase();
  const b=brands.find(x=>u.includes(x));
  if(!b)return "";
  return b==="GENERAL ELECTRIC"?"GE":b;
}
async function runSmartScan(){
  const f=$("dataPlatePhoto").files[0];
  if(!f){ alert("Take or choose a data-plate photo first."); return; }
  if(!window.Tesseract){ alert("OCR library could not load. Check internet connection and try again."); return; }
  $("ocrProgress").textContent="Starting OCR…";
  $("smartScan").disabled=true;
  try{
    const result=await Tesseract.recognize(f,"eng",{logger:m=>{
      if(m.status){ $("ocrProgress").textContent = m.progress!=null ? `${m.status} ${Math.round(m.progress*100)}%` : m.status; }
    }});
    const text=result.data.text||"";
    $("ocrText").value=text;
    const model=extractIdentifier(text,["MODEL","MOD"]);
    const serial=extractIdentifier(text,["SERIAL","SER","S/N","SN"]);
    const mf=inferManufacturer(text);
    if(model){$("model").value=model;$("model").classList.add("scan-found")}
    if(serial){$("serial").value=serial;$("serial").classList.add("scan-found")}
    if(mf){$("manufacturer").value=mf;$("manufacturer").classList.add("scan-found")}
    $("ocrProgress").textContent=`Scan complete${model?" • model found":""}${serial?" • serial found":""}`;
  }catch(err){
    console.error(err); $("ocrProgress").textContent="OCR failed — improve lighting/crop and retry.";
  }finally{$("smartScan").disabled=false;}
}
$("smartScan").addEventListener("click",runSmartScan);

$("techSheet").addEventListener("change",e=>{ manualFile=e.target.files[0]||null; manualText=""; $("manualStatus").textContent=manualFile?"Ready to index":""; });

async function loadPdfJs(){
  if(window.pdfjsLib) return window.pdfjsLib;
  try{
    const mod=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
    mod.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
    window.pdfjsLib=mod; return mod;
  }catch(e){ throw new Error("PDF engine could not load"); }
}
async function indexTechSheet(){
  if(!manualFile){alert("Attach a tech-sheet PDF first.");return;}
  $("indexManual").disabled=true; $("manualStatus").textContent="Indexing PDF…";
  try{
    const pdfjs=await loadPdfJs();
    const buf=await manualFile.arrayBuffer();
    const pdf=await pdfjs.getDocument({data:buf}).promise;
    let parts=[];
    for(let p=1;p<=pdf.numPages;p++){
      $("manualStatus").textContent=`Reading page ${p} of ${pdf.numPages}…`;
      const page=await pdf.getPage(p); const content=await page.getTextContent();
      const t=content.items.map(i=>i.str).join(" "); parts.push(`\n--- PAGE ${p} ---\n${t}`);
    }
    manualText=parts.join("\n");
    $("manualStatus").textContent=`Indexed ${pdf.numPages} pages • ${Math.round(manualText.length/1000)}k characters`;
  }catch(e){console.error(e);$("manualStatus").textContent="Could not index this PDF. It may be image-only or the PDF engine failed to load.";}
  finally{$("indexManual").disabled=false;}
}
$("indexManual").addEventListener("click",indexTechSheet);

function tokenize(q){return String(q).toLowerCase().match(/[a-z0-9][a-z0-9+.-]{1,}/g)||[];}
function searchManual(q){
  if(!manualText) return [];
  const pages=manualText.split(/\n--- PAGE (\d+) ---\n/);
  const toks=tokenize(q).filter(x=>!['the','and','how','what','does','this','that','with','from','into'].includes(x));
  const hits=[];
  for(let i=1;i<pages.length;i+=2){
    const page=pages[i], text=pages[i+1]||"", low=text.toLowerCase();
    let score=0; toks.forEach(t=>{const n=(low.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length;score+=n;});
    if(score>0){
      let at=Math.min(...toks.map(t=>low.indexOf(t)).filter(x=>x>=0)); if(!Number.isFinite(at))at=0;
      const start=Math.max(0,at-220), end=Math.min(text.length,at+700);
      hits.push({page,score,snippet:text.slice(start,end).replace(/\s+/g,' ').trim()});
    }
  }
  return hits.sort((a,b)=>b.score-a.score).slice(0,3);
}

// Replace V1 prompt-only action with actual browser-side manual search when indexed.
$("manualAssist").onclick=()=>{
  const q=$("manualQuestion").value.trim()||"diagnostic mode error code test procedure expected values";
  if(!manualText){
    $("manualPrompt").value="Index the attached tech-sheet PDF first. If the manual is image-only, Smart Manual OCR will require the next backend/OCR layer.";
    return;
  }
  const hits=searchManual(q);
  if(!hits.length){$("manualPrompt").value=`No strong text match found for: ${q}\nTry exact error-code text, component name, 'diagnostic mode', 'service mode', or 'test mode'.`;return;}
  $("manualPrompt").value=hits.map(h=>`PAGE ${h.page} • relevance ${h.score}\n${h.snippet}`).join("\n\n====================\n\n");
};

if("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(()=>{});

// --- V1.2 AUTO SERVICE DATA DISCOVERY ---
const manufacturerSources = {
  "ge": {name:"GE Appliances", support:"https://www.geappliances.com/ge/service-and-support/literature.htm", domains:["geappliances.com"]},
  "hotpoint": {name:"Hotpoint / GE Appliances", support:"https://www.geappliances.com/ge/service-and-support/literature.htm", domains:["geappliances.com"]},
  "frigidaire": {name:"Frigidaire", support:"https://www.frigidaire.com/en/owner-support", domains:["frigidaire.com"]},
  "electrolux": {name:"Electrolux", support:"https://owner.electrolux.com/support", domains:["electrolux.com"]},
  "whirlpool": {name:"Whirlpool", support:"https://www.whirlpool.com/services/manuals.html", domains:["whirlpool.com"]},
  "maytag": {name:"Maytag", support:"https://www.maytag.com/services/manuals.html", domains:["maytag.com"]},
  "amana": {name:"Amana", support:"https://www.amana.com/services/manuals.html", domains:["amana.com"]},
  "kitchenaid": {name:"KitchenAid", support:"https://www.kitchenaid.com/service-and-support/manuals.html", domains:["kitchenaid.com"]},
  "samsung": {name:"Samsung", support:"https://www.samsung.com/us/support/downloads/", domains:["samsung.com"]},
  "lg": {name:"LG", support:"https://www.lg.com/us/support/manuals-documents", domains:["lg.com"]},
  "bosch": {name:"Bosch", support:"https://www.bosch-home.com/us/owner-support/manuals", domains:["bosch-home.com"]},
  "carrier": {name:"Carrier", support:"https://www.carrier.com/residential/en/us/products/manuals/", domains:["carrier.com"]},
  "goodman": {name:"Goodman", support:"https://www.goodmanmfg.com/resources/literature-library", domains:["goodmanmfg.com"]},
  "daikin": {name:"Daikin", support:"https://www.daikincomfort.com/resources", domains:["daikincomfort.com"]},
  "trane": {name:"Trane", support:"https://www.trane.com/residential/en/resources/owners-guides/", domains:["trane.com"]},
  "rheem": {name:"Rheem", support:"https://www.rheem.com/resources/", domains:["rheem.com"]},
  "ruud": {name:"Ruud", support:"https://www.ruud.com/resources/", domains:["ruud.com"]},
  "lennox": {name:"Lennox", support:"https://www.lennox.com/residential/owners/assistance/resources", domains:["lennox.com"]}
};

function normalizeManufacturer(raw){
  const x=String(raw||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").trim();
  for(const key of Object.keys(manufacturerSources)) if(x.includes(key)) return key;
  return null;
}
function searchUrl(q){ return "https://www.google.com/search?q="+encodeURIComponent(q); }
function serviceDataQueries(mfr, model, trade){
  const exact = `"${model}"`;
  return [
    {label:"Exact Service Manual PDF", q:`${mfr} ${exact} service manual filetype:pdf`, note:"Best first search — exact model + service manual + PDF"},
    {label:"Tech Sheet / Mini Manual", q:`${mfr} ${exact} tech sheet OR mini manual filetype:pdf`, note:"Often contains diagnostic mode, error codes, wiring and test values"},
    {label:"Wiring Diagram", q:`${mfr} ${exact} wiring diagram schematic filetype:pdf`, note:"Electrical schematic / sequence evidence"},
    {label:"Parts & Exploded View", q:`${mfr} ${exact} parts diagram exploded view`, note:"Useful for part identification and cross-reference"}
  ];
}
function renderServiceData(){
  const mfrRaw=$("manufacturer").value.trim(), model=$("model").value.trim(), trade=$("trade").value;
  const box=$("serviceDataResults"), status=$("serviceDataStatus");
  if(!model){ status.textContent="Model number required."; box.innerHTML=""; return; }
  const key=normalizeManufacturer(mfrRaw), src=key?manufacturerSources[key]:null;
  const display=src?src.name:(mfrRaw||"Manufacturer");
  const links=[];
  if(src) links.push(`<a class="service-result" target="_blank" rel="noopener" href="${src.support}"><strong>${src.name} official support <span class="source-badge">OFFICIAL</span></strong><span>Start with manufacturer documentation for ${escapeHtml(model)}</span></a>`);
  serviceDataQueries(display,model,trade).forEach(x=>links.push(`<a class="service-result" target="_blank" rel="noopener" href="${searchUrl(x.q)}"><strong>${x.label}</strong><span>${escapeHtml(x.note)}</span></a>`));
  if(src) links.push(`<a class="service-result" target="_blank" rel="noopener" href="${searchUrl(`site:${src.domains[0]} \"${model}\" filetype:pdf`)}"><strong>Search only ${src.domains[0]} <span class="source-badge">DOMAIN FILTER</span></strong><span>Restricts results to the recognized manufacturer's domain</span></a>`);
  box.innerHTML=links.join("")+`<div class="warning verified-rule"><strong>Verification rule:</strong> Do not treat a manual as exact until its model-family coverage includes <b>${escapeHtml(model)}</b>. Serial number may also determine revisions, control boards, refrigerant, or production changes.</div>`;
  status.textContent=src?`Recognized ${src.name}. Exact-model searches ready.`:"Manufacturer not mapped yet. Generic exact-model searches ready.";
  localStorage.setItem("lastServiceSearch",JSON.stringify({manufacturer:mfrRaw,model,recognized:!!src,when:new Date().toISOString()}));
}
$("findServiceData").addEventListener("click",renderServiceData);

// Refresh discovery when Smart Scan successfully fills asset identifiers.
const previousSmartScan = typeof runSmartScan === "function" ? runSmartScan : null;
if(previousSmartScan){
  $("smartScan").removeEventListener("click", previousSmartScan);
  $("smartScan").addEventListener("click", async()=>{ await previousSmartScan(); if($("model").value.trim()) renderServiceData(); });
}

// ===== V1.3 BACKEND INTEGRATION =====
let backendOnline=false;
async function backendHealth(){
  try{
    const r=await fetch('/api/health',{cache:'no-store'}); const j=await r.json();
    backendOnline=!!j.ok; if($('backendStatus')) $('backendStatus').textContent=`Backend: ${backendOnline?'online':'offline'}`;
  }catch(e){ backendOnline=false; if($('backendStatus')) $('backendStatus').textContent='Backend: browser-only'; }
}
backendHealth();

function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}

async function backendOCR(){
  const f=$('dataPlatePhoto').files[0]; if(!f) throw new Error('Take or choose a data-plate photo first.');
  const image=await fileToDataURL(f);
  const r=await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});
  const j=await r.json(); if(!j.ok) throw new Error(j.error||'OCR failed');
  if(j.asset.manufacturer) $('manufacturer').value=j.asset.manufacturer;
  if(j.asset.model) $('model').value=j.asset.model;
  if(j.asset.serial) $('serial').value=j.asset.serial;
  if($('ocrText')) $('ocrText').value=j.text||'';
  if($('ocrProgress')) $('ocrProgress').textContent=`Backend OCR complete${j.asset.model?' • model '+j.asset.model:''}${j.asset.serial?' • serial '+j.asset.serial:''}`;
  if(typeof renderServiceData==='function' && $('model').value.trim()) renderServiceData();
}

// Prefer backend Smart Scan; preserve V1.1 browser OCR fallback.
if($('smartScan')){
  const old=$('smartScan').cloneNode(true); $('smartScan').replaceWith(old);
  old.addEventListener('click',async()=>{
    if($('ocrProgress')) $('ocrProgress').textContent='Reading nameplate…';
    try{ if(!backendOnline) await backendHealth(); if(backendOnline) return await backendOCR(); }
    catch(e){ console.warn('Backend OCR fallback',e); }
    if(typeof runSmartScan==='function') return runSmartScan();
  });
}

async function backendIndexPDF(file){
  const pdf=await fileToDataURL(file);
  const r=await fetch('/api/manual/index',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdf})});
  const j=await r.json(); if(!j.ok) throw new Error(j.error||'PDF indexing failed');
  manualText=j.text||''; return j;
}

if($('indexManual')){
  const old=$('indexManual').cloneNode(true); $('indexManual').replaceWith(old);
  old.addEventListener('click',async()=>{
    if(!manualFile){alert('Attach a tech-sheet PDF first.');return;}
    try{
      if(!backendOnline) await backendHealth();
      if(backendOnline){ $('manualStatus').textContent='Backend indexing PDF…'; const j=await backendIndexPDF(manualFile); $('manualStatus').textContent=`Backend indexed ${j.pages} pages • ${Math.round(j.characters/1000)}k characters`; return; }
    }catch(e){ console.warn(e); $('manualStatus').textContent='Backend failed; trying browser PDF engine…'; }
    // compact browser fallback
    try{const buf=await manualFile.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:buf}).promise;let parts=[];for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();parts.push(`\n--- PAGE ${p} ---\n`+content.items.map(x=>x.str).join(' '));}manualText=parts.join('\n');$('manualStatus').textContent=`Browser indexed ${pdf.numPages} pages • ${Math.round(manualText.length/1000)}k characters`;}catch(e){$('manualStatus').textContent='Could not index PDF.';}
  });
}

if($('fetchManualUrl')) $('fetchManualUrl').addEventListener('click',async()=>{
  const url=$('manualUrl').value.trim(); if(!url){$('fetchManualStatus').textContent='Paste a direct manufacturer PDF URL first.';return;}
  try{
    $('fetchManualStatus').textContent='Fetching manufacturer PDF…';
    const r=await fetch('/api/manual/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const j=await r.json(); if(!j.ok) throw new Error(j.error||'Fetch failed'); manualText=j.text||'';
    $('fetchManualStatus').textContent=`Indexed ${j.pages} pages from manufacturer PDF.`;
    localStorage.setItem('lastTechSheetName',j.source_url||url);
  }catch(e){$('fetchManualStatus').textContent=e.message;}
});

// ===== V1.4 AUTO MANUAL DISCOVERY + VERIFICATION =====
let discoveredManualCandidates=[];

function candidateCard(c,idx){
  const reason=(c.reasons||[]).map(escapeHtml).join(' • ') || 'Candidate discovered online';
  const badge=c.official?'<span class="source-badge">OFFICIAL DOMAIN</span>':'<span class="source-badge">UNVERIFIED SOURCE</span>';
  const verify=c.direct_pdf && c.official ? `<button class="secondary verify-manual" data-i="${idx}">Verify & Index</button>` : '';
  return `<div class="manual-candidate">
    <div class="candidate-score"><strong>${Number(c.score||0)}%</strong><span>candidate</span></div>
    <div class="candidate-main"><strong>${escapeHtml(c.title||'Manual candidate')} ${badge}</strong><span>${reason}</span><div class="candidate-actions"><a target="_blank" rel="noopener" href="${escapeHtml(c.url)}">Open</a>${verify}</div></div>
  </div>`;
}

async function autoDiscoverManuals(){
  const model=$('model').value.trim(), manufacturer=$('manufacturer').value.trim();
  const box=$('serviceDataResults'), status=$('serviceDataStatus');
  if(!model){status.textContent='Model number required.';box.innerHTML='';return;}
  status.textContent='Searching for exact-model service data…';
  try{
    if(!backendOnline) await backendHealth();
    if(!backendOnline) throw new Error('Backend is offline. Start V1.4 with the included server.');
    const r=await fetch('/api/manual/discover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({manufacturer,model,trade:$('trade').value})});
    const j=await r.json(); if(!j.ok) throw new Error(j.error||'Discovery failed');
    discoveredManualCandidates=j.candidates||[];
    const support=j.official?`<a class="service-result" target="_blank" rel="noopener" href="${j.official.support}"><strong>${escapeHtml(j.official.name)} official support <span class="source-badge">OFFICIAL</span></strong><span>Manufacturer documentation portal for ${escapeHtml(model)}</span></a>`:'';
    const cards=discoveredManualCandidates.length?discoveredManualCandidates.map(candidateCard).join(''):`<div class="warning">No direct candidates were returned automatically. Use the official support link and the exact-model search fallback below.</div>`;
    box.innerHTML=support+cards+`<div class="warning verified-rule"><strong>Authority rule:</strong> Candidate score is not diagnosis confidence. A service PDF becomes <b>VERIFIED</b> only when the exact model appears inside the fetched document. Serial/revision applicability can still require a secondary check.</div>`;
    box.querySelectorAll('.verify-manual').forEach(b=>b.addEventListener('click',()=>verifyAndIndexCandidate(Number(b.dataset.i),b)));
    status.textContent=`${discoveredManualCandidates.length} candidate${discoveredManualCandidates.length===1?'':'s'} found${j.search_available?'':' • automatic search unavailable; official portal shown'}.`;
  }catch(e){
    status.textContent=e.message;
    // Preserve V1.2 deterministic fallback links.
    renderServiceData();
  }
}

async function verifyAndIndexCandidate(i,button){
  const c=discoveredManualCandidates[i]; if(!c)return;
  const old=button.textContent; button.disabled=true; button.textContent='Verifying PDF…';
  try{
    const r=await fetch('/api/manual/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:c.url,manufacturer:$('manufacturer').value.trim(),model:$('model').value.trim(),serial:$('serial').value.trim()})});
    const j=await r.json(); if(!j.ok) throw new Error(j.error||'Verification failed');
    if(j.verified){
      manualText=j.text||''; localStorage.setItem('lastTechSheetName',j.source_url||c.url);
      $('techSheetInfo').innerHTML=`<strong>VERIFIED service data</strong><br>${escapeHtml($('model').value.trim())} found inside PDF • ${j.pages} pages • score ${j.score}%`;
      $('manualStatus').textContent='Verified exact-model PDF indexed and ready to search.';
      button.textContent='✓ Verified & Indexed'; button.classList.add('verified-button');
      $('manualUrl').value=j.source_url||c.url;
    }else{
      $('manualStatus').textContent=`Candidate rejected: exact model not found inside PDF (verification score ${j.score}%).`;
      button.textContent='Rejected — model not found'; button.classList.add('rejected-button');
    }
  }catch(e){ button.textContent='Verification failed'; $('manualStatus').textContent=e.message; }
  finally{ if(button.textContent==='Verifying PDF…')button.textContent=old; button.disabled=false; }
}

if($('findServiceData')){
  const newer=$('findServiceData').cloneNode(true); $('findServiceData').replaceWith(newer);
  newer.textContent='Auto-Locate Exact Manual'; newer.addEventListener('click',autoDiscoverManuals);
}


// ===== V1.5 AI EVIDENCE ENGINE =====
function compactManualForEvidence(){
  // Limit request payload while preserving page markers and diagnostic text.
  if(!manualText) return '';
  if(manualText.length<=350000) return manualText;
  const q=_localTokens([$('complaint').value,$('model').value,$('trade').value].join(' '));
  const pages=manualText.split(/(?=\n--- PAGE \d+ ---\n)/);
  const scored=pages.map(p=>({p,score:[...q].reduce((n,t)=>n+(p.toLowerCase().includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score).slice(0,45);
  return scored.map(x=>x.p).join('\n');
}
function _localTokens(s){return new Set(String(s||'').toLowerCase().match(/[a-z0-9]{3,}/g)||[])}
function renderEvidenceResults(j){
  const wrap=$('rankedDiagnoses');
  const rows=j.ranked_diagnoses||[];
  if(!rows.length){wrap.innerHTML='<div class="warning">No ranked diagnosis returned.</div>';return;}
  wrap.innerHTML=rows.map((d,i)=>{
    const mc=(d.manual_evidence||[]).map(x=>`<div class="manual-cite"><strong>Manual p.${x.page||'?'}</strong> — ${escapeHtml(x.excerpt||'')}</div>`).join('');
    const hc=(d.history_evidence||[]).map(x=>`<div class="history-cite"><strong>Similar saved case ${x.score}%</strong> — ${escapeHtml(x.complaint||'')} → ${escapeHtml(x.diagnosis||'')}</div>`).join('');
    const comp=d.confidence_components||{};
    return `<div class="ranked-dx"><div class="rank-score"><strong>#${i+1}</strong><span>${d.confidence}% confidence</span></div><div><h3>${escapeHtml(d.title)}</h3><div class="evidence-sources"><span class="evidence-chip">Field ${comp.field_evidence||0}</span><span class="evidence-chip">Manual +${comp.manual_bonus||0}</span><span class="evidence-chip">History +${comp.history_bonus||0}</span></div><div class="rank-detail"><strong>Next test:</strong> ${escapeHtml(d.next_test||'')}</div>${mc}${hc}</div></div>`;
  }).join('');
  const best=rows[0];
  $('diagnosisTitle').textContent=best.title; $('confidenceText').textContent=best.confidence+'%'; $('confidenceBar').style.width=best.confidence+'%';
  $('nextTest').textContent=best.next_test||''; $('disproof').textContent=best.disproof||'';
  $('supportEvidence').innerHTML=(best.support||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>No supporting evidence returned.</li>';
  $('conflictEvidence').innerHTML=(best.missing||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>No major missing evidence.</li>';
  localStorage.setItem('lastDiagnosis',JSON.stringify({title:best.title,score:best.confidence,support:best.support||[],conflict:best.missing||[],next:best.next_test,disproof:best.disproof,evidence_engine:true}));
}
async function runEvidenceEngine(){
  const status=$('evidenceEngineStatus'); status.textContent='Combining field readings, manual evidence, and repair history…';
  try{
    if(!backendOnline) await backendHealth();
    if(!backendOnline) throw new Error('V1.5 backend is offline. Start the included server first.');
    const history=JSON.parse(localStorage.getItem('cases')||'[]').slice(0,100);
    const payload={trade:$('trade').value,complaint:$('complaint').value.trim(),manufacturer:$('manufacturer').value.trim(),model:$('model').value.trim(),serial:$('serial').value.trim(),measurements:measurements(),observations:$('observations').value,manual_text:compactManualForEvidence(),history};
    const r=await fetch('/api/evidence/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json(); if(!j.ok) throw new Error(j.error||'Evidence analysis failed');
    renderEvidenceResults(j);
    status.textContent=`Analyzed ${Object.keys(payload.measurements).length} readings • ${j.manual_available?'manual indexed':'no indexed manual'} • ${j.history_cases_considered} saved case(s) considered.`;
  }catch(e){status.textContent=e.message;}
}
if($('runEvidenceEngine')) $('runEvidenceEngine').addEventListener('click',runEvidenceEngine);


// ===== V1.6 Conversational Senior Tech AI =====
function seniorManualText(){
  try {
    if (typeof compactManualForEvidence === 'function') return compactManualForEvidence();
  } catch(e){}
  return localStorage.getItem('indexedManualText') || '';
}
function seniorAddChat(role,text){
  const log=$('seniorChatLog'); if(!log)return;
  const d=document.createElement('div'); d.className='chat-msg '+role;
  d.innerHTML=`<span class="chat-role">${role==='user'?'Field Tech':'Senior Tech AI'}</span>${escapeHtml(text)}`;
  log.appendChild(d); log.scrollTop=log.scrollHeight;
}
function renderParsedReadings(parsed){
  const box=$('parsedReadings'); if(!box)return;
  const entries=Object.entries(parsed||{});
  box.innerHTML=entries.length ? entries.map(([k,v])=>`<span class="reading-chip">${escapeHtml(k.replaceAll('_',' '))}: ${escapeHtml(v)}</span>`).join('') : 'No numeric readings were confidently parsed from that message.';
}
function renderSeniorResult(j){
  $('seniorVerdict').textContent=j.verdict||'Insufficient evidence';
  $('seniorResponse').textContent=j.response||'';
  $('seniorConfidence').textContent=(j.confidence||0)+'%';
  $('seniorConfidenceBar').style.width=(j.confidence||0)+'%';
  $('seniorSupport').innerHTML=(j.support||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>No strong supporting evidence yet.</li>';
  $('seniorChallenge').innerHTML=(j.challenge||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>No major contradiction identified.</li>';
  $('seniorNextTest').textContent=j.next_test||'Capture another discriminating measurement.';
  $('seniorDisproof').textContent=j.disproof||'No specific disproof test yet.';
  const mh=j.manual_evidence||[];
  $('seniorManualEvidence').innerHTML=mh.length?mh.map(x=>`<div><strong>Page ${escapeHtml(x.page||'?')}</strong> — ${escapeHtml(x.text||x.snippet||'')}</div>`).join('<hr>'):'No verified manual passage contributed to this call.';
  renderParsedReadings(j.parsed_measurements||{});
}
async function seniorAnalyze(){
  const text=$('seniorInput').value.trim(); if(!text){ alert('Describe the field case first.'); return; }
  seniorAddChat('user',text);
  const history=JSON.parse(localStorage.getItem('cases')||'[]').slice(0,30);
  const payload={
    text,
    trade:$('trade').value,
    complaint:$('complaint').value.trim(),
    manufacturer:$('manufacturer').value.trim(),
    model:$('model').value.trim(),
    serial:$('serial').value.trim(),
    measurements:measurements(),
    observations:$('observations').value,
    manual_text:seniorManualText(),
    history
  };
  try{
    const r=await fetch('/api/senior-tech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json(); if(!j.ok)throw new Error(j.error||'Senior Tech analysis failed');
    renderSeniorResult(j);
    seniorAddChat('ai',j.response||j.verdict);
    // Feed parsed spoken measurements back into structured fields.
    Object.entries(j.parsed_measurements||{}).forEach(([k,v])=>{
      const el=document.querySelector(`[data-measure="${k}"]`); if(el && !el.value) el.value=v;
    });
    updateDrierDrop();
  }catch(e){
    // Local fallback: place the spoken text into observations and use deterministic engine.
    $('observations').value += ($('observations').value?' ':'')+text;
    if(typeof runEngine==='function') runEngine();
    $('seniorVerdict').textContent='Local diagnostic fallback used';
    $('seniorResponse').textContent='Backend Senior Tech AI is unavailable. The case was passed to the local deterministic diagnostic engine.';
    seniorAddChat('ai',$('seniorResponse').textContent);
  }
}
if($('seniorAnalyze')) $('seniorAnalyze').addEventListener('click',seniorAnalyze);
if($('seniorVoice')) $('seniorVoice').addEventListener('click',()=>voiceInto($('seniorInput')));
if($('seniorClear')) $('seniorClear').addEventListener('click',()=>{
  $('seniorInput').value=''; $('seniorChatLog').innerHTML=''; $('parsedReadings').textContent='No spoken readings parsed yet.';
  $('seniorVerdict').textContent='Ready for a field case.'; $('seniorResponse').textContent='Describe the problem in normal language.';
  $('seniorConfidence').textContent='0%'; $('seniorConfidenceBar').style.width='0%';
});


// ===== V1.7 Field Case Intelligence =====
function intelCurrentCase(){
  let diagnosis=null; try{diagnosis=JSON.parse(localStorage.getItem("lastDiagnosis")||"null")}catch(e){}
  return {
    trade:$("trade").value, complaint:$("complaint").value, manufacturer:$("manufacturer").value,
    model:$("model").value, serial:$("serial").value, measurements:measurements(),
    observations:$("observations").value, diagnosis
  };
}
function intelEscape(x){return escapeHtml(x==null?"":String(x))}
function renderCaseIntel(j){
  $("caseIntelSummary").innerHTML=`Found <strong>${j.total_matches||0}</strong> relevant saved case(s). The list is ranked by model, manufacturer, complaint, diagnosis, and comparable readings.`;
  $("historySuggestion").textContent=j.suggestion||"No strong historical pattern.";
  $("repeatPattern").textContent=j.repeat_pattern||"No repeated pattern identified.";
  const outs=j.outcomes||[];
  $("repairMemory").innerHTML=outs.length?outs.map(o=>`<div class="history-item"><strong>${intelEscape(o.repair)}</strong><div class="meta">${o.count} relevant case(s) • strongest similarity ${o.best_score}%</div></div>`).join(""):"No confirmed repair outcomes available yet.";
  const ms=j.matches||[];
  $("similarCasesList").innerHTML=ms.length?ms.map(x=>{
    const c=x.case||{}; const d=c.diagnosis&&c.diagnosis.title?c.diagnosis.title:"No diagnosis saved";
    return `<div class="history-item"><strong>${x.score}% match — ${intelEscape(c.manufacturer)} ${intelEscape(c.model)}</strong>
      <div>${intelEscape(c.complaint||"No complaint")}</div>
      <div><b>Diagnosis:</b> ${intelEscape(d)}</div>
      <div><b>Repair:</b> ${intelEscape(c.repair||"No completed repair recorded")}</div>
      <div><b>Verification:</b> ${intelEscape(c.verification||"No verification recorded")}</div>
      <div class="meta">${intelEscape((x.reasons||[]).join(" • "))}</div></div>`;
  }).join(""):`<div class="resource-box">No sufficiently similar saved cases yet.</div>`;
}
async function findSimilarCases(){
  const history=await loadPersistentCases();
  if(!history.length){$("caseIntelSummary").textContent="No saved repair history yet. Complete and save a few cases first.";return;}
  try{
    const r=await fetch("/api/case-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({current:intelCurrentCase(),history})});
    const j=await r.json(); if(!j.ok)throw new Error(j.error||"Comparison failed"); renderCaseIntel(j);
  }catch(e){
    // Lightweight browser fallback prioritizes exact model and complaint terms.
    const cur=intelCurrentCase(); const nm=(cur.model||"").replace(/[^a-z0-9]/gi,"").toLowerCase();
    const words=new Set((cur.complaint||"").toLowerCase().split(/\W+/).filter(x=>x.length>3));
    const matches=history.map(c=>{
      let score=0,reasons=[]; const pm=(c.model||"").replace(/[^a-z0-9]/gi,"").toLowerCase();
      if(nm&&pm&&nm===pm){score+=60;reasons.push("Exact model match")}
      if(cur.manufacturer&&c.manufacturer&&cur.manufacturer.toLowerCase()===c.manufacturer.toLowerCase()){score+=15;reasons.push("Same manufacturer")}
      const pw=new Set((c.complaint||"").toLowerCase().split(/\W+/).filter(x=>x.length>3));
      const ov=[...words].filter(w=>pw.has(w)).length; score+=Math.min(25,ov*5); if(ov)reasons.push("Similar complaint");
      return {score,reasons,case:c};
    }).filter(x=>x.score>=10).sort((a,b)=>b.score-a.score).slice(0,5);
    renderCaseIntel({ok:true,matches,total_matches:matches.length,outcomes:[],suggestion:"Backend unavailable; showing local model/complaint similarity only.",repeat_pattern:"Full repeated-failure analysis requires the V1.7 backend."});
  }
}
if($("findSimilarCases")) $("findSimilarCases").addEventListener("click",findSimilarCases);
