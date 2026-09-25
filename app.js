/* AmarPDF Editor Build — no framework, no build step. */
(() => {
"use strict";

const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib || {};
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const state = { files: [], currentTool: null, timerSeconds: 1800, timerId: null, objectUrls: [], editor: null };

const DONATION_URL = "https://example.com/your-donation-link"; // <-- replace with your support/donation URL
// Optional: set this to your own email-notification endpoint (e.g. a small Cloudflare Worker / Apps Script / EmailJS bridge).
// GitHub Pages cannot send email directly or safely expose Gmail credentials.
const SUPPORT_NOTIFY_ENDPOINT = "https://script.google.com/macros/s/AKfycbwhHj2cUvyHpTGBUIOPzfuqCWatbwTOe5E_ZNuPKF3Hb-gW2KptFs1dg0CXM-eV6QZyNQ/exec";

// ============================================================
// QUICK CODE MAP
// Edit PDF footer buttons are defined in toolMarkup("edit").
// - EDITOR_APPLY_BUTTON_ID: runs the PDF export.
// - EDITOR_DOWNLOAD_BUTTON_ID: direct <a download> for latest PDF.
// - editPdf(): creates and validates the latest edited PDF.
// - openEditorFile(): loads the PDF into the editor.
// Responsive editor CSS is at the bottom of style.css.
// ============================================================
const EDITOR_APPLY_BUTTON_ID = "runBtn";
const EDITOR_DOWNLOAD_BUTTON_ID = "editorDirectDownload";

const TOOLS = [
  // Featured row — keep these six first so they appear first in the toolbox.
  ["pdfimages","PDF → Images","Export PDF pages as high-quality PNG or JPG images.","▧"],
  ["imagepdf","Images → PDF","Turn JPG, PNG or WebP images into a PDF.","▤"],
  ["merge","Merge PDF","Combine multiple PDFs into one.","⇢"],
  ["compress","Compress PDF","Reduce PDF file size with adjustable quality and target size.","◒"],
  ["edit","Edit PDF","Open, reconstruct and edit PDF text, images and page objects.","✎"],
  ["signature","Add signature","Place a signature image on your PDF pages.","✓"],
  ["imageResize","Image Resize","Resize images, change pixel dimensions and print resolution with high-quality output.","⌗"],
  ["split","Split PDF","Create separate PDFs from page ranges.","✂"],
  ["extract","Extract pages","Keep only the pages you choose.","▣"],
  ["delete","Delete pages","Remove selected pages from a PDF.","⌫"],
  ["reorder","Rearrange pages","Change the order of pages.","↕"],
  ["rotate","Rotate pages","Rotate all or selected pages.","↻"],
  ["watermark","Watermark","Add a text watermark to every page.","◇"],
  ["pagenumbers","Page numbers","Add page numbers to the document.","#"],
  ["crop","Crop PDF","Set a crop box for every page.","□"],
  ["resize","Resize PDF pages","Scale PDF pages to A4, Letter or custom size.","⤢"],
  ["forms","Fill forms","Fill standard AcroForm fields by name.","☑"]
];

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fmtBytes(n){if(n<1024)return n+" B";let k=n/1024;if(k<1024)return k.toFixed(1)+" KB";return (k/1024).toFixed(1)+" MB";}
function setStatus(msg,type=""){const el=$("#status");if(el){el.textContent=msg;el.className="status "+type;}}
function showCompletion(){const n=$("#completionNotice");if(n)n.classList.remove("hidden")}
function toolButtonLabel(id){const m=toolMeta(id);return m?({merge:"Merge PDFs",split:"Split PDF",extract:"Extract pages",delete:"Delete pages",reorder:"Rearrange PDF",rotate:"Rotate PDF",compress:"Compress PDF",edit:"Apply Edit",watermark:"Add Watermark",pagenumbers:"Add Page Numbers",crop:"Crop PDF",resize:"Resize PDF",pdfimages:"Export Images",imagepdf:"Create PDF",signature:"Add Signature",imageResize:"Resize Image",forms:"Fill Form"}[id]||m[1]):"Process PDF"}
function setRunState(id,state){const b=$("#runBtn");if(!b)return;const label=toolButtonLabel(id);b.classList.remove("is-processing","is-done");b.disabled=false;if(state==="processing"){b.disabled=true;b.classList.add("is-processing");b.innerHTML='<span class="btn-spinner"></span><span>Processing…</span>'}else if(state==="done"){b.disabled=false;b.classList.add("is-done");b.innerHTML='✓ Done'}else{b.innerHTML=label}}
function setProcessingProgress(id,pct,label="Processing…"){const b=$("#runBtn");if(!b)return;const n=Math.max(0,Math.min(100,Math.round(pct)));b.disabled=true;b.classList.add("is-processing");b.innerHTML='<span class="btn-spinner"></span><span>'+esc(label)+('</span>')+(label.includes("%")?'':' <small class="btn-progress">'+n+'%</small>');}
function resetRunButton(){if(state.currentTool)setRunState(state.currentTool,"ready")}
function markProcessing(id){setStatus("");const old=$("#resultCard");if(old)old.remove();const n=$("#completionNotice");if(n)n.classList.add("hidden");setRunState(id,"processing")}
function showSupportGate(onDownload){
  // A browser-local one-time reaction keeps repeat downloads from generating
  // another support notification from the same browser profile.
  const reactedKey = "amarPDF_support_reacted_v1";
  if(localStorage.getItem(reactedKey)==="1"){
    onDownload();
    return;
  }

  const old=$("#supportGate");if(old)old.remove();
  const gate=document.createElement("div");gate.id="supportGate";gate.className="support-gate";gate.innerHTML=`
    <div class="support-gate-backdrop" data-support-close></div>
    <div class="support-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="supportGateTitle">
      <button class="support-gate-close" type="button" aria-label="Close" data-support-close>×</button>
      <div class="support-gate-icon" aria-hidden="true">♡</div>
      <div class="support-gate-kicker">For Supporting!</div>
      <h3 id="supportGateTitle">Send love to download</h3>
      <p>AmarPDF is free to use. Tap the heart below to support the project, then your file will start downloading.</p>
      <button class="support-heart-btn" id="supportHeartBtn" type="button" aria-label="Send love to download"><span>♡</span><small>Send Love</small></button>
      <div class="support-thanks" id="supportThanks" aria-live="polite">Your reaction is required before download.</div>
    </div>`;
  document.body.appendChild(gate);
  const close=()=>gate.remove();
  $$('[data-support-close]',gate).forEach(el=>el.addEventListener('click',close));
  const heart=$("#supportHeartBtn",gate);
  let reacted=false;
  heart.addEventListener("click",async()=>{
    if(reacted)return;
    reacted=true;
    heart.disabled=true;
    heart.classList.add("reacted");
    heart.setAttribute("aria-pressed","true");
    heart.innerHTML='<span>♥</span><small>Supported</small>';
    const icon=$(".support-gate-icon",gate);if(icon)icon.textContent="♥";
    const thanks=$("#supportThanks",gate);thanks.textContent="Thanks for the support ♥";thanks.classList.add("show");
    // Set locally before the request so a repeated click/navigation cannot
    // generate another notification from this browser profile.
    localStorage.setItem(reactedKey,"1");
    const eventId=(crypto.randomUUID?crypto.randomUUID():"reaction-"+Date.now()+"-"+Math.random().toString(36).slice(2));
    if(SUPPORT_NOTIFY_ENDPOINT && /^https:\/\//i.test(SUPPORT_NOTIFY_ENDPOINT)){
      try{await fetch(SUPPORT_NOTIFY_ENDPOINT,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({event:"support_reaction",eventId,tool:state.currentTool||"unknown",timestamp:new Date().toISOString(),userAgent:navigator.userAgent})});}catch{}
    }
    setTimeout(()=>{close();onDownload()},650);
  });
  setTimeout(()=>heart.focus(),50);
}
function triggerDownload(url,name){
  const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
}
function showResult(bytes,name,originalSize=null,type="application/pdf"){
  const old=$("#resultCard");if(old)old.remove();
  const mount=$("#toolMount"),card=document.createElement("div");card.id="resultCard";card.className="result-card";
  const extra=originalSize?` • ${fmtBytes(originalSize)} → ${fmtBytes(bytes.byteLength)}`:"";
  card.innerHTML=`<div class="result-icon">✓</div><div class="result-copy"><strong>Ready to download</strong><small>${esc(name)} • ${fmtBytes(bytes.byteLength)}${extra}</small></div><button class="btn" id="resultDownload">Download</button>`;
  mount.appendChild(card);
  const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob);state.objectUrls.push(url);
  $("#resultDownload").onclick=()=>showSupportGate(()=>triggerDownload(url,name));
  showCompletion();
}
function processing(msg){ /* progress is shown in the main action button */ }

function downloadBytes(bytes,name,type="application/pdf",originalSize=null){showResult(bytes,name,originalSize,type);}
function pagesSpec(str,max){
  const out=[]; const seen=new Set();
  for(const part of String(str||"").split(",")){
    const p=part.trim(); if(!p)continue;
    if(/^\\d+$/.test(p)){const n=+p;if(n>=1&&n<=max&&!seen.has(n)){seen.add(n);out.push(n-1)}}
    else if(/^\\d+\\s*-\\s*\\d+$/.test(p)){let [a,b]=p.split("-").map(Number);if(a>b)[a,b]=[b,a];for(let n=a;n<=b;n++)if(n>=1&&n<=max&&!seen.has(n)){seen.add(n);out.push(n-1)}}
  }
  return out;
}
function rows(files, removable=true){
  return `<div class="file-list">${files.map((f,i)=>`<div class="file-row" data-i="${i}"><span>📄</span><span class="name" title="${esc(f.name)}">${esc(f.name)}</span><small>${fmtBytes(f.size)}</small>${removable?`<button class="btn btn-ghost remove-file" data-i="${i}">Remove</button>`:""}</div>`).join("")}</div>`;
}
function inputBlock(multiple=false,accept=".pdf,application/pdf"){
  return `<label class="dropzone" id="toolDrop"><input id="toolInput" type="file" accept="${accept}" ${multiple?"multiple":""}><strong>Choose file${multiple?"s":""}</strong><span>or drag & drop here</span></label>`;
}
function commonActions(runText="Process PDF"){
  return `<div class="tool-actions"><button class="btn" id="runBtn">${runText}</button><button class="btn btn-ghost" id="clearBtn">Clear</button></div>`;
}

function renderTools(filter=""){
  const q=filter.trim().toLowerCase();
  $("#toolGrid").innerHTML=TOOLS.filter(t=>!q||t[1].toLowerCase().includes(q)||t[2].toLowerCase().includes(q))
    .map(([id,title,desc,icon])=>`<article class="tool-card" data-tool="${id}"><div class="tool-icon">${icon}</div><h3>${title}</h3><p>${desc}</p></article>`).join("");
}
function toolMeta(id){return TOOLS.find(t=>t[0]===id);}
function openTool(id,files=[],options={}){
  const meta=toolMeta(id); if(!meta)return;
  const pushHistory=options.pushHistory!==false;
  if(pushHistory){
    try{history.pushState({nexapdfTool:id},"",`#tool=${encodeURIComponent(id)}`)}catch{}
  }
  state.currentTool=id; state.files=files.slice();
  $("#home").classList.add("hidden");$("#tools").classList.add("hidden");$("#privacy").classList.add("hidden");$("#about").classList.add("hidden");
  $("#workspace").classList.remove("hidden");
  $("#toolKicker").textContent="PDF TOOL";$("#toolTitle").textContent=meta[1];$("#toolDesc").textContent=meta[2];
  $("#toolMount").innerHTML=toolMarkup(id); setStatus("");
  bindTool(id); restartTimer(); window.scrollTo({top:0,behavior:"smooth"});
}
function goHome(options={}){
  const replaceHistory=options.replaceHistory!==false;
  state.currentTool=null; state.files=[]; state.timerSeconds=1800;
  document.body.classList.remove("nexapdf-editor-mode");
  if(state.editor?.pageObserver)try{state.editor.pageObserver.disconnect()}catch{}
  if(state.editor?.downloadUrl)try{URL.revokeObjectURL(state.editor.downloadUrl)}catch{}
  state.editor=null;
  if(replaceHistory){try{history.replaceState({nexapdfHome:true},"",location.pathname+location.search)}catch{}}
  $("#workspace").classList.add("hidden");$("#home").classList.remove("hidden");$("#tools").classList.remove("hidden");$("#privacy").classList.remove("hidden");$("#about").classList.remove("hidden");
  renderHomeFiles([]); renderTools($("#toolSearch").value); clearObjectUrls();
  window.scrollTo({top:0,behavior:"smooth"});
}
function toolMarkup(id){
  if(id==="merge") return `<div class="tool-panel">${inputBlock(true)}<div id="fileMount">${rows(state.files)}</div><p class="hint">PDFs are merged in the order shown above.</p>${commonActions("Merge PDFs")}</div>`;
  if(["split","extract","delete","reorder","rotate"].includes(id)) return `<div class="tool-panel">${inputBlock()}<div id="fileMount">${rows(state.files)}</div><div class="options">${id==="reorder"?`<div class="field full"><label>New order</label><input id="order" placeholder="Example: 3,1,2,4"></div>`:`<div class="field full"><label>${id==="rotate"?"Pages (blank = all)":"Pages"}</label><input id="pages" placeholder="Example: 1,3-5,8"></div>`}${id==="rotate"?`<div class="field"><label>Angle</label><select id="angle"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></div>`:""}</div>${commonActions(id==="split"?"Split PDF":id==="extract"?"Extract pages":id==="delete"?"Delete pages":id==="reorder"?"Rearrange PDF":"Rotate PDF")}</div>`;
  if(id==="compress") return `<div class="tool-panel compression-panel">${inputBlock()}<div id="fileMount">${rows(state.files)}</div><div class="compression-settings"><div class="mode-tabs"><button type="button" class="mode-tab active" data-mode="target">Target size</button><button type="button" class="mode-tab" data-mode="preset">Quality preset</button></div><input id="compressMode" type="hidden" value="target"><div class="compress-target"><div class="target-head"><div><span class="setting-kicker">TARGET FILE SIZE</span><strong id="targetValue">—</strong></div><span id="targetRangeLabel">Choose a PDF first</span></div><div class="target-slider-wrap"><input id="targetSlider" type="range" min="10" max="95" step="1" value="60" aria-label="Target PDF size" disabled><div class="slider-scale"><span id="targetMin">—</span><span id="targetPercent">60%</span><span id="targetMax">—</span></div></div><div class="target-meta"><span id="reductionLabel">—</span><span>Drag the slider — the selected size is the optimizer target.</span></div></div><div class="preset-settings" id="presetSettings"><div class="field"><label>Quality</label><select id="quality"><option value="0.90">High</option><option value="0.72" selected>Balanced</option><option value="0.52">Small</option></select></div><div class="field"><label>Render resolution</label><select id="scale"><option value="1.5">High</option><option value="1.15" selected>Balanced</option><option value=".9">Small</option></select></div></div></div><div class="compression-summary"><span>Original</span><strong id="originalSizeLabel">Choose a PDF</strong><span class="arrow">→</span><span>Target</span><strong id="summaryTarget">—</strong></div>${commonActions("Compress PDF")}</div>`;
  // EDIT PDF UI: the Apply/Edit + Download controls are in the footer below.
  // Search for EDITOR_APPLY_BUTTON_ID / EDITOR_DOWNLOAD_BUTTON_ID to customize them.
  if(id==="edit") return `<div class="editor-shell editor-fullscreen">
    <div class="editor-topbar">
      <div class="editor-brandline"><button class="editor-home-btn" id="editorHome" title="Back to AmarPDF home">← Home</button><span class="editor-app-dot"></span><strong>AmarPDF Editor</strong><span class="editor-file-title" id="editorFileNameTop">No document</span></div>
      <div class="editor-tools">
        <button class="editor-tool active" data-edit-tool="select">↖ <span>Select</span></button>
        <button class="editor-tool" data-edit-tool="text">T <span>Text</span></button>
        <button class="editor-tool" data-edit-tool="image">▧ <span>Image</span></button>
        <button class="editor-tool" data-edit-tool="rect">□ <span>Shape</span></button>
        <button class="editor-tool" data-edit-tool="line">／ <span>Line</span></button>
        <button class="editor-tool" data-edit-tool="delete">⌫ <span>Delete</span></button>
        <span class="editor-divider"></span>
        <select id="editorFontSize" class="editor-format-select" title="Font size">
          <option value="10">10</option><option value="12">12</option><option value="14">14</option><option value="16">16</option><option value="18" selected>18</option><option value="20">20</option><option value="24">24</option><option value="28">28</option><option value="32">32</option><option value="40">40</option><option value="48">48</option>
        </select>
        <button class="editor-format-btn" id="editorBold" title="Bold">B</button>
        <button class="editor-format-btn italic" id="editorItalic" title="Italic">I</button>
        <button class="editor-format-btn underline" id="editorUnderline" title="Underline">U</button>
        <input id="editorTextColor" class="editor-color" type="color" value="#111827" title="Text color">
      </div>
      <div class="editor-view-controls"><button class="editor-icon-btn" id="editorFit">Fit</button><button class="editor-icon-btn" id="editorZoomOut">−</button><span id="editorZoomLabel">100%</span><button class="editor-icon-btn" id="editorZoomIn">+</button></div>
    </div>
    <div class="editor-subbar">
      <div class="editor-nav"><button id="editorPrev" class="editor-icon-btn">‹</button><label>Page <input id="editorPageInput" type="number" min="1" value="1"></label><span>/ <b id="editorPageCount">—</b></span><button id="editorNext" class="editor-icon-btn">›</button></div>
      <div class="editor-live-tools"><button id="editorUndo" class="editor-icon-btn">↶</button><button id="editorRedo" class="editor-icon-btn">↷</button><span class="editor-hint">Click text and type directly • drag objects to move</span></div>
    </div>
    <div class="editor-body editor-body-full">
      <aside class="editor-sidebar"><div class="editor-file-head"><strong>Pages</strong><span id="editorPageCountSide">—</span></div><div id="editorThumbs" class="editor-thumbs"></div></aside>
      <main class="editor-stage"><div id="editorEmpty" class="editor-empty">${inputBlock()}<p>Open a PDF to edit it directly on the document.</p></div><div id="editorCanvasArea" class="editor-canvas-area hidden"></div></main>
    </div>
    <input id="editorImageInput" type="file" accept="image/png,image/jpeg,image/webp" hidden>
    <div class="editor-footer"><div><strong id="editorFileName">No document</strong><span id="editorInfo">—</span></div><div class="tool-actions-inline"><button class="btn btn-ghost" id="editorClear" type="button">Close</button><button class="btn editor-apply-btn" id="${EDITOR_APPLY_BUTTON_ID}" type="button">Apply Edit</button><a class="btn editor-direct-download disabled" id="${EDITOR_DOWNLOAD_BUTTON_ID}" href="#" download aria-disabled="true">↓ Download latest PDF</a></div></div>
  </div>`;
  if(id==="watermark") return `<div class="tool-panel">${inputBlock()}<div id="fileMount">${rows(state.files)}</div><div class="options"><div class="field"><label>Watermark text</label><input id="wmText" value="CONFIDENTIAL"></div><div class="field"><label>Font size</label><input id="wmSize" type="number" value="42"></div><div class="field"><label>Opacity</label><input id="wmOpacity" type="number" min=".05" max="1" step=".05" value=".25"></div><div class="field"><label>Rotation</label><input id="wmAngle" type="number" value="35"></div></div>${commonActions("Add Watermark")}</div>`;
  if(id==="pagenumbers") return `<div class="tool-panel">${inputBlock()}<div id="fileMount">${rows(state.files)}</div><div class="options"><div class="field"><label>Position</label><select id="numPos"><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-center">Top center</option></select></div><div class="field"><label>Starting number</label><input id="numStart" type="number" value="1"></div><div class="field"><label>Format</label><input id="numFormat" value="Page {n}"></div></div>${commonActions("Add Page Numbers")}</div>`;
  if(id==="crop") return `<div class="tool-panel">${inputBlock()}<div id="fileMount">${rows(state.files)}</div><div class="options"><div class="field"><label>Left margin</label><input id="cropL" type="number" value="20"></div><div class="field"><label>Right margin</label><input id="cropR" type="number" value="20"></div><div class="field"><label>Top margin</label><input id="cropT" type="number" value="20"></div><div class="field"><label>Bottom margin</label><input id="cropB" type="number" value="20"></div></div><p class="hint">Margins are PDF points and are applied as a crop box to every page.</p>${commonActions("Crop PDF")}</div>`;
  if(id==="imageResize") return `<div class="tool-panel image-resize-panel">
    ${inputBlock(true,"image/jpeg,image/png,image/webp,image/bmp,image/gif,.jpg,.jpeg,.png,.webp,.bmp,.gif")}
    <div id="fileMount">${rows(state.files)}</div>
    <div class="image-resize-simple-head"><div><span class="setting-kicker">IMAGE RESIZER</span><h3>Resize your image</h3><p>Choose a target file size or set exact dimensions. AmarPDF keeps the result as sharp as possible.</p></div><span class="resize-quality-badge-simple">HD QUALITY</span></div>
    <div class="image-size-card"><div class="size-card-top"><div><label>Target file size <small class="muted-inline">(maximum)</small></label><strong id="imageTargetSizeLabel">1 MB</strong></div><div class="size-unit-toggle"><button type="button" class="size-unit active" data-unit="mb">MB</button><button type="button" class="size-unit" data-unit="kb">KB</button></div></div><input id="imageTargetSizeSlider" type="range" min="0.005" max="20" step="0.005" value="1"><div class="size-scale"><span id="imageTargetMin">5 KB</span><span>Target size</span><span id="imageTargetMax">20 MB</span></div><p class="hint compact">The optimizer targets this size while preserving the highest practical visual quality.</p></div>
    <div class="image-dimension-card"><div class="dimension-heading"><div><label>Custom dimensions</label><small>Set width and height in pixels</small></div><label class="check-row"><input id="imageResizeAspect" type="checkbox" checked> <span>Keep aspect ratio</span></label></div><div class="dimension-grid"><div class="field"><label>Width (px)</label><input id="imageResizeW" type="number" min="1" max="30000" placeholder="Auto"></div><div class="dimension-link">×</div><div class="field"><label>Height (px)</label><input id="imageResizeH" type="number" min="1" max="30000" placeholder="Auto"></div></div></div>
    <div class="image-format-card"><div class="field"><label>Output format</label><select id="imageResizeFormat"><option value="jpeg" selected>JPG</option><option value="webp">WebP</option><option value="png">PNG</option></select></div><p class="hint compact">JPG is recommended for photos and target-size compression.</p></div>
    <div class="image-advanced-row"><details><summary>More options</summary><div class="advanced-options"><div class="field"><label>Resolution</label><select id="imageResizeDpi"><option value="72">72 DPI</option><option value="96" selected>96 DPI</option><option value="150">150 DPI</option><option value="300">300 DPI — print</option><option value="600">600 DPI</option><option value="custom">Custom</option></select></div><div class="field hidden" id="imageCustomDpiField"><label>Custom DPI</label><input id="imageCustomDpi" type="number" min="1" max="2400" value="300"></div><div class="field"><label>JPEG/WebP quality</label><select id="imageResizeQuality"><option value="0.98">Maximum</option><option value="0.95">Very high</option><option value="0.90">High</option><option value="0.82">Balanced</option></select></div></div></details></div>
    <div class="image-resize-summary"><div><span>Original</span><strong id="imageResizeOriginal">Choose images</strong></div><span class="arrow">→</span><div><span>Output</span><strong id="imageResizeOutput">—</strong></div><div><span>Target</span><strong id="imageResizeResolution">1 MB</strong></div></div><p class="hint">JPG/WebP is recommended for photos. PNG is available for lossless output. Multiple images are packaged into one ZIP.</p>${commonActions("Resize Images")}
  </div>`;
  if(id==="resize") return `<div class="tool-panel">${inputBlock()}<div id="fileMount">${rows(state.files)}</div><div class="options"><div class="field"><label>Page size</label><select id="paper"><option value="a4">A4</option><option value="letter">US Letter</option><option value="custom">Custom</option></select></div><div class="field"><label>Orientation</label><select id="orient"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div><div class="field"><label>Custom width (pt)</label><input id="customW" type="number" value="595"></div><div class="field"><label>Custom height (pt)</label><input id="customH" type="number" value="842"></div></div>${commonActions("Resize PDF")}</div>`;
  if(id==="pdfimages") return `<div class="tool-panel">${inputBlock()}<div id="fileMount">${rows(state.files)}</div><div class="options"><div class="field"><label>Format</label><select id="imgFormat"><option value="png">PNG</option><option value="jpeg">JPG</option></select></div><div class="field"><label>Scale</label><select id="imgScale"><option value="1">100%</option><option value="1.5" selected>150%</option><option value="2">200%</option></select></div></div><p class="hint">The result is downloaded as a ZIP containing one image per page.</p>${commonActions("Export Images")}</div>`;
  if(id==="imagepdf") return `<div class="tool-panel">${inputBlock(true,"image/*,.jpg,.jpeg,.png")}<div id="fileMount">${rows(state.files)}</div><div class="options"><div class="field"><label>Page size</label><select id="imgPaper"><option value="fit">Fit image</option><option value="a4">A4</option><option value="letter">US Letter</option></select></div><div class="field"><label>Margin (pt)</label><input id="imgMargin" type="number" value="18"></div></div>${commonActions("Create PDF")}</div>`;
  if(id==="signature") return `<div class="tool-panel">${inputBlock()}<div id="fileMount">${rows(state.files)}</div><div class="options"><div class="field full"><label>Signature image (PNG/JPG)</label><input id="sigInput" type="file" accept="image/png,image/jpeg"></div><div class="field"><label>Page</label><input id="sigPage" type="number" value="1" min="1"></div><div class="field"><label>X</label><input id="sigX" type="number" value="60"></div><div class="field"><label>Y</label><input id="sigY" type="number" value="60"></div><div class="field"><label>Width</label><input id="sigW" type="number" value="160"></div></div>${commonActions("Add Signature")}</div>`;
  if(id==="forms") return `<div class="tool-panel">${inputBlock()}<div id="fileMount">${rows(state.files)}</div><div class="options"><div class="field full"><label>Field values</label><textarea id="formValues" rows="8" placeholder="FieldName = Value&#10;AnotherField = Yes"></textarea></div></div><p class="hint">Works with standard AcroForm text fields, checkboxes and radio groups where their field names are available. XFA forms are not supported.</p>${commonActions("Fill Form")}</div>`;
  return "";
}

function bindTool(id){
  const input=$("#toolInput");
  const multiple=["merge","imagepdf","imageResize"].includes(id);
  if(input){input.onchange=()=>{acceptToolFiles([...input.files],multiple,id);resetRunButton()}; const drop=$("#toolDrop"); bindDrop(drop,input,multiple,id);}
  if(id==="compress"){
    const mode=$("#compressMode"),slider=$("#targetSlider"),quality=$("#quality"),scale=$("#scale"),preset=$("#presetSettings");
    const tabs=$$(".mode-tab");
    const update=()=>{
      const custom=mode.value==="target";
      tabs.forEach(t=>t.classList.toggle("active",t.dataset.mode===mode.value));
      if(preset)preset.classList.toggle("disabled-settings",custom);
      if(quality)quality.disabled=custom;
      if(scale)scale.disabled=custom;
      if(slider)slider.disabled=!custom || !state.files.length;
      updateTargetControls();
    };
    tabs.forEach(t=>t.addEventListener("click",()=>{mode.value=t.dataset.mode;update()}));
    slider?.addEventListener("input",()=>{
      slider.dataset.userSet="1";
      updateTargetControls();
    });
    slider?.addEventListener("change",updateTargetControls);
    update();
  }
  if(id==="imageResize") bindImageResizeTool();
  if(id==="edit") bindEditor();
  if(id==="signature"){
    $("#sigInput")?.addEventListener("change",()=>{const old=$("#resultCard");if(old)old.remove();resetRunButton()});
  }
  if(id==="merge"||id==="imagepdf") renderFileMount(id);
  $("#runBtn")?.addEventListener("click",()=>runTool(id));
  $("#clearBtn")?.addEventListener("click",()=>{state.files=[];renderFileMount(id);setStatus("");resetRunButton();});
  setRunState(id,"ready");
}
function bindDrop(drop,input,multiple,id){
  if(!drop)return;
  ["dragenter","dragover"].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.add("drag")}));
  ["dragleave","drop"].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.remove("drag")}));
  drop.addEventListener("drop",e=>{acceptToolFiles([...e.dataTransfer.files],multiple,id);resetRunButton()});
}
function acceptToolFiles(fs,multiple,id=state.currentTool){
  const imageMode=["imagepdf","imageResize"].includes(id);
  const good=fs.filter(f=>imageMode?(/image\//i.test(f.type)||/\.(jpe?g|png|webp)$/i.test(f.name)):(/pdf/i.test(f.type)||/\.pdf$/i.test(f.name)));
  state.files=multiple?good:good.slice(0,1); if(id==="compress"){const s=$("#targetSlider");if(s)delete s.dataset.userSet;} renderFileMount(state.currentTool);
  const old=$("#resultCard");if(old)old.remove();const n=$("#completionNotice");if(n)n.classList.add("hidden");
  setStatus(state.files.length?`${state.files.length} file${state.files.length>1?"s":""} ready.`:""); if(id==="compress")updateTargetControls();
  if(id==="imageResize"){cacheImageDimensions(state.files).then(()=>updateImageResizeSummary());}
  resetRunButton();
}
function renderFileMount(id){
  const m=$("#fileMount"); if(!m)return;
  m.innerHTML=rows(state.files);
  $$(".remove-file",m).forEach(b=>b.onclick=()=>{state.files.splice(+b.dataset.i,1);renderFileMount(id)});
}
async function readBytes(file){return new Uint8Array(await file.arrayBuffer());}
async function loadPdf(file){return PDFDocument.load(await readBytes(file));}
function ensureFiles(n=1){if(state.files.length<n){setStatus(`Please choose ${n===1?"a PDF":"the required PDF files"} first.`,"error");return false}return true;}
function saveName(base,suffix){return base.replace(/\.pdf$/i,"")+suffix+".pdf";}

async function runTool(id){
  // The Edit button ALWAYS means “apply the current edits and generate a new PDF”.
  // Downloading is handled by the separate, persistent Download button.
  if(!state.files.length && id!=="imagepdf"){setStatus("Please choose a file first.","error");return}
  markProcessing(id);
  try{
    if(!window.PDFLib)throw new Error("PDF engine did not load. Refresh and try again.");
    if(id==="edit"){await editPdf();return;}
    if(id==="merge")await merge();
    else if(["split","extract","delete","reorder","rotate"].includes(id))await pageOps(id);
    else if(id==="compress")await compress();
    else if(id==="watermark")await watermark();
    else if(id==="pagenumbers")await pageNumbers();
    else if(id==="crop")await cropPdf();
    else if(id==="resize")await resizePdf();
    else if(id==="imageResize")await resizeImages();
    else if(id==="pdfimages")await pdfToImages();
    else if(id==="imagepdf")await imagesToPdf();
    else if(id==="signature")await signature();
    else if(id==="forms")await fillForms();
    if(!$("#status")?.className.includes("error"))setRunState(id,"done");
  }catch(e){console.error(e);setStatus("Could not process the PDF: "+(e.message||e),"error");setRunState(id,"ready");}
}
async function merge(){
  if(!ensureFiles(2))return; 
  const out=await PDFDocument.create();
  for(const f of state.files){const src=await loadPdf(f);const copied=await out.copyPages(src,src.getPageIndices());copied.forEach(p=>out.addPage(p));}
  const bytes=await out.save({useObjectStreams:true});downloadBytes(bytes,"merged.pdf");setStatus("Done — merged PDF downloaded.","success");
}
async function pageOps(id){
  if(!ensureFiles())return; const src=await loadPdf(state.files[0]); const count=src.getPageCount();
  let inds;
  if(id==="reorder") inds=pagesSpec($("#order").value,count);
  else {const s=$("#pages").value.trim();inds=s?pagesSpec(s,count):Array.from({length:count},(_,i)=>i);}
  if(!inds.length){setStatus("Enter a valid page list, e.g. 1,3-5,8.","error");return}
  
  if(id==="split"){
    const out=await PDFDocument.create();
    for(let i=0;i<inds.length;i++){const [p]=await out.copyPages(src,[inds[i]]);out.addPage(p)}
    downloadBytes(await out.save(),"split.pdf");setStatus("Done — selected pages downloaded.","success");return;
  }
  if(id==="extract"){
    const out=await PDFDocument.create();const ps=await out.copyPages(src,inds);ps.forEach(p=>out.addPage(p));
    downloadBytes(await out.save(),"extracted-pages.pdf");setStatus("Done.","success");return;
  }
  if(id==="delete"){
    const keep=Array.from({length:count},(_,i)=>i).filter(i=>!inds.includes(i)); if(!keep.length){setStatus("You cannot delete every page.","error");return}
    const out=await PDFDocument.create();const ps=await out.copyPages(src,keep);ps.forEach(p=>out.addPage(p));
    downloadBytes(await out.save(),"pages-deleted.pdf");setStatus("Done.","success");return;
  }
  if(id==="reorder"){
    if(inds.length!==count){setStatus("For reorder, include every page exactly once.","error");return}
    const out=await PDFDocument.create();const ps=await out.copyPages(src,inds);ps.forEach(p=>out.addPage(p));
    downloadBytes(await out.save(),"reordered.pdf");setStatus("Done.","success");return;
  }
  const angle=+$("#angle").value;const wanted=$("#pages").value.trim()?new Set(inds):new Set(Array.from({length:count},(_,i)=>i));
  src.getPages().forEach((p,i)=>{if(wanted.has(i))p.setRotation(degrees(p.getRotation().angle+angle))});
  downloadBytes(await src.save(),"rotated.pdf");setStatus("Done.","success");
}
async function getPdfJsPage(file,pageNum,scale=1){
  if(!window.pdfjsLib)throw new Error("PDF.js did not load. Refresh and try again.");
  const task=pdfjsLib.getDocument({data:await readBytes(file),disableWorker:true});const pdf=await task.promise;return pdf.getPage(pageNum);
}
async function renderPageCanvas(file,pageNum,scale=1){
  const page=await getPdfJsPage(file,pageNum,scale);const viewport=page.getViewport({scale});
  const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;return canvas;
}
function formatTargetBytes(bytes){const n=Math.max(0,Number(bytes)||0);if(n<1024)return Math.round(n)+" B";const kb=n/1024;if(kb<1024)return Math.round(kb)+" KB";return (kb/1024).toFixed(kb/1024>=10?1:2)+" MB"}
function targetBytesFromSlider(raw){const original=state.files[0]?.size||0;return Math.max(1,Math.round(original*(Number(raw)/100)))}
function updateTargetControls(){
  if(state.currentTool!=="compress")return;
  const slider=$("#targetSlider"),value=$("#targetValue"),minEl=$("#targetMin"),maxEl=$("#targetMax"),origEl=$("#originalSizeLabel"),sumEl=$("#summaryTarget"),redEl=$("#reductionLabel"),pctEl=$("#targetPercent"),rangeLabel=$("#targetRangeLabel");
  if(!slider)return;
  const original=state.files[0]?.size||0;
  if(!original){slider.disabled=false;slider.min=10;slider.max=95;slider.value=60;value.textContent="—";minEl.textContent="—";maxEl.textContent="—";origEl.textContent="Choose a PDF";sumEl.textContent="—";redEl.textContent="—";if(pctEl)pctEl.textContent="60%";if(rangeLabel)rangeLabel.textContent="Choose a PDF first";return}
  const minPct=original<200*1024?50:10;
  const maxPct=95;
  slider.min=String(minPct);slider.max=String(maxPct);slider.step="1";
  if(!slider.dataset.userSet)slider.value=String(Math.min(60,maxPct));
  const pct=Number(slider.value)||60;
  const target=targetBytesFromSlider(pct);
  slider.disabled=false;
  value.textContent=formatTargetBytes(target);
  minEl.textContent=formatTargetBytes(targetBytesFromSlider(minPct));
  maxEl.textContent=formatTargetBytes(targetBytesFromSlider(maxPct));
  origEl.textContent=fmtBytes(original);
  sumEl.textContent=formatTargetBytes(target);
  redEl.textContent=Math.max(0,Math.round((1-target/original)*100))+"% smaller target";
  if(pctEl)pctEl.textContent=pct+"%";
  if(rangeLabel)rangeLabel.textContent=`${fmtBytes(original)} original • ${pct}% target`;
}
async function canvasJpegBytes(canvas,quality){
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("JPEG encoding failed.")),"image/jpeg",quality));
  return new Uint8Array(await blob.arrayBuffer());
}
async function compress(){
  if(!ensureFiles())return;
  const file=state.files[0],originalSize=file.size,mode=$("#compressMode")?.value||"target";
  const task=pdfjsLib.getDocument({data:await readBytes(file),disableWorker:true}),pdf=await task.promise;
  const pageInfo=[]; for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const v=p.getViewport({scale:1});pageInfo.push({w:v.width,h:v.height})}
  const cache=new Map();
  async function canvasesForScale(scale,onPage){
    const key=String(scale);if(cache.has(key))return cache.get(key);
    const arr=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i),viewport=page.getViewport({scale});
      const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
      await page.render({canvasContext:canvas.getContext("2d",{alpha:false}),viewport}).promise;arr.push(canvas);if(onPage)onPage(i,pdf.numPages);
    }
    cache.set(key,arr);return arr;
  }
  async function build(q,scale,onPage){
    const canvases=await canvasesForScale(scale,onPage),out=await PDFDocument.create();
    for(let i=0;i<canvases.length;i++){const jpg=await canvasJpegBytes(canvases[i],q),img=await out.embedJpg(jpg),p=out.addPage([pageInfo[i].w,pageInfo[i].h]);p.drawImage(img,{x:0,y:0,width:pageInfo[i].w,height:pageInfo[i].h})}
    return await out.save({useObjectStreams:true,addDefaultPage:false});
  }
  if(mode==="preset"){
    const q=+$("#quality").value,scale=+$("#scale").value;setProcessingProgress("compress",8,"Preparing…");const bytes=await build(q,scale,(i,n)=>setProcessingProgress("compress",10+Math.round(i/n*35),"Rendering…"));downloadBytes(bytes,saveName(file.name,"-compressed"),"application/pdf",originalSize);setStatus(`Compression complete: ${fmtBytes(originalSize)} → ${fmtBytes(bytes.length)}.` ,"success");return;
  }
  const target=targetBytesFromSlider($("#targetSlider").value);if(target>=originalSize){setStatus("Choose a target smaller than the original file.","error");return}
  // Search across render resolutions and JPEG quality. For each scale, quality is binary-searched
  // because JPEG output is generally monotonic enough for a target-size search, then refined locally.
  const ratio=target/originalSize;
  const scales=[...new Set(
    ratio>=.82?[1.45,1.25,1.05,.9,.75,.62]:
    ratio>=.60?[1.25,1.08,.92,.78,.65,.55]:
    ratio>=.40?[1.05,.9,.76,.62,.5,.42]:
    [.9,.75,.62,.5,.42,.34]
  )];
  let attempt=0;const maxAttempts=scales.length*8;let bestUnder=null,bestClosest=null;
  const consider=(candidate)=>{
    if(!bestClosest||Math.abs(candidate.bytes.length-target)<Math.abs(bestClosest.bytes.length-target))bestClosest=candidate;
    if(candidate.bytes.length<=target&&(!bestUnder||candidate.bytes.length>bestUnder.bytes.length))bestUnder=candidate;
  };
  for(const scale of scales){
    let lo=.10,hi=.96;
    for(let iter=0;iter<7;iter++){
      const q=(lo+hi)/2;attempt++;setProcessingProgress("compress",Math.round(attempt/maxAttempts*92),"Optimizing…");
      const bytes=await build(q,scale,()=>{});consider({bytes,quality:q,scale});
      if(bytes.length>target)hi=q;else lo=q;
    }
    // Test a few values around the binary-search boundary; this catches JPEG-size plateaus.
    for(const q of [lo-.06,lo-.03,lo,lo+.03,lo+.06]){
      const quality=Math.min(.96,Math.max(.10,q));attempt++;setProcessingProgress("compress",Math.min(98,Math.round(attempt/maxAttempts*92)),"Fine tuning…");
      const bytes=await build(quality,scale,()=>{});consider({bytes,quality,scale});
    }
    if(bestUnder&&bestUnder.bytes.length>=target*.985)break;
  }
  if(!bestClosest)throw new Error("The optimizer could not create a compressed PDF.");
  const chosen=bestUnder||bestClosest;
  downloadBytes(chosen.bytes,saveName(file.name,"-compressed"),"application/pdf",originalSize);
  setProcessingProgress("compress",100,"Finalizing…");
  if(chosen.bytes.length<=target)setStatus(`Target reached: ${fmtBytes(originalSize)} → ${fmtBytes(chosen.bytes.length)} (target ${fmtBytes(target)}).`,"success");
  else setStatus(`Closest result: ${fmtBytes(originalSize)} → ${fmtBytes(chosen.bytes.length)}. Requested target: ${fmtBytes(target)}.`,"success");
}
// ============================================================
// EDITOR EXPORT
// This is the only place that creates the downloadable edited PDF.
// Flow: Apply Edit -> generate PDF bytes -> validate -> update link.
// ============================================================
async function editPdf(){
  const ed=state.editor;
  if(!ed?.sourceFile){setStatus("Open a PDF in the editor first.","error");return false}
  const P=window.PDFLib;
  if(!P?.PDFDocument){throw new Error("PDF engine is not available. Please refresh the page and try again.")}
  setProcessingProgress("edit",5,"Generating edited PDF…");
  const sourceBytes=await readBytes(ed.sourceFile);
  const out=await P.PDFDocument.load(sourceBytes);
  const fontCache=new Map();
  const getFont=async(name)=>{
    const key=String(name||P.StandardFonts.Helvetica);
    if(!fontCache.has(key)) fontCache.set(key,out.embedFont(key));
    return fontCache.get(key);
  };
  const pages=ed.pages||[];
  let appliedObjects=0, skippedObjects=0;

  for(let pi=0;pi<pages.length;pi++){
    const model=pages[pi], page=out.getPage(pi), pageH=page.getHeight(), pageW=page.getWidth();
    // Existing/changed text. Each object is isolated so one unusual PDF text item
    // cannot abort the entire export.
    for(const obj of (model.objects||[])){
      if(obj.kind!=="text") continue;
      const changed=!!obj.added || obj.text!==obj.original || obj.pdfX!==obj.originalX || obj.pdfYTop!==obj.originalYTop || obj.fontSize!==obj.originalFontSize || obj.fontChoice!==obj.originalFontChoice || obj.weight!==obj.originalWeight || obj.underline!==obj.originalUnderline || obj.color!==obj.originalColor || (Array.isArray(obj.charStyles)&&obj.charStyles.length>0);
      if(!changed) continue;
      try{
        const oldX=Number.isFinite(obj.originalX)?obj.originalX:obj.pdfX;
        const oldY=Number.isFinite(obj.originalYTop)?obj.originalYTop:obj.pdfYTop;
        const oldW=Math.max(4,Number(obj.originalW||obj.pdfW||20));
        const oldH=Math.max(6,Number(obj.originalH||obj.pdfH||12));
        const pad=Math.max(1.5,(Number(obj.fontSize)||12)*.08);
        const [mr,mg,mb]=hexRgb(obj.maskColor||"#ffffff");
        page.drawRectangle({x:Math.max(0,oldX-pad),y:Math.max(0,pageH-oldY-oldH-pad),width:Math.min(pageW,oldW+pad*2),height:Math.min(pageH,oldH+pad*2),color:P.rgb(mr,mg,mb),borderWidth:0});
        const runs=buildStyledTextRuns(obj);
        let cursorX=Math.max(0,Math.min(pageW-1,Number(obj.pdfX)||0));
        const baseSize=Math.max(4,Number(obj.fontSize)||Math.max(6,oldH*.85));
        for(const run of runs){
          if(!run.text) continue;
          try{
            const font=await getFont(mapPdfFont(run));
            const runSize=Math.max(4,Number(run.fontSize)||baseSize);
            const color=P.rgb(...hexRgb(run.color||obj.color||"#111827"));
            const width=pdfTextWidth(run.text,font,runSize);
            let x=cursorX;
            if(obj.align==="center"&&runs.length===1)x=Math.max(0,Math.min(pageW-width,(Number(obj.pdfX)||0)+(Number(obj.pdfW)||width-width)/2));
            if(obj.align==="right"&&runs.length===1)x=Math.max(0,Math.min(pageW-width,(Number(obj.pdfX)||0)+(Number(obj.pdfW)||width)-width));
            const y=Math.max(0,pageH-(Number(obj.pdfYTop)||0)-runSize);
            page.drawText(run.text,{x,y,size:runSize,font,color});
            if(run.underline){page.drawLine({start:{x,y:y-1.5},end:{x:x+width,y:y-1.5},thickness:Math.max(.5,runSize*.045),color})}
            cursorX=x+width;
          }catch(runErr){
            skippedObjects++;
            console.warn("AmarPDF: skipped text run during export",runErr,run.text);
          }
        }
        appliedObjects++;
      }catch(objErr){
        skippedObjects++;
        console.warn("AmarPDF: skipped object during export",objErr,obj);
      }
    }
    // Added graphical objects.
    for(const obj of (model.objects||[])){
      try{
        if(obj.kind==="image"&&obj.data){
          const bytes=base64ToBytes(obj.data), img=/png/i.test(obj.mime||"")?await out.embedPng(bytes):await out.embedJpg(bytes);
          page.drawImage(img,{x:obj.pdfX,y:pageH-obj.pdfYTop-obj.pdfH,width:obj.pdfW,height:obj.pdfH});
        }else if(obj.kind==="rect"){
          page.drawRectangle({x:obj.pdfX,y:pageH-obj.pdfYTop-obj.pdfH,width:obj.pdfW,height:obj.pdfH,borderColor:P.rgb(.25,.28,.45),borderWidth:2,opacity:.95});
        }else if(obj.kind==="line"){
          page.drawLine({start:{x:obj.pdfX,y:pageH-obj.pdfYTop},end:{x:obj.pdfX+obj.pdfW,y:pageH-obj.pdfYTop-obj.pdfH},thickness:2,color:P.rgb(.25,.28,.45)});
        }
      }catch(objErr){console.warn("AmarPDF: skipped graphic during export",objErr)}
    }
    setProcessingProgress("edit",10+Math.round(((pi+1)/Math.max(1,pages.length))*85),`Generating page ${pi+1}…`);
  }

  // pdf-lib's documented save() returns the actual serialized PDF bytes.
  const bytes=await out.save({useObjectStreams:true});
  if(!(bytes instanceof Uint8Array) || bytes.length<100) throw new Error("PDF export returned no usable file data.");
  const signature=String.fromCharCode(...bytes.slice(0,5));
  if(signature!=="%PDF-") throw new Error("The generated file is not a valid PDF.");

  // Atomically replace the previous downloadable version only after a valid PDF exists.
  if(ed.downloadUrl){try{URL.revokeObjectURL(ed.downloadUrl)}catch{}}
  ed.outputBytes=new Uint8Array(bytes);
  ed.outputName=saveName(ed.sourceFile.name,"-edited");
  ed.downloadBlob=new Blob([ed.outputBytes],{type:"application/pdf"});
  ed.downloadUrl=URL.createObjectURL(ed.downloadBlob);

  const a=$("#"+EDITOR_DOWNLOAD_BUTTON_ID);
  if(a){
    a.href=ed.downloadUrl;
    a.download=ed.outputName;
    a.classList.remove("disabled");
    a.removeAttribute("aria-disabled");
    a.style.pointerEvents="auto";
    a.title=`Download ${ed.outputName}`;
    a.onclick=(ev)=>{ev.preventDefault();showSupportGate(()=>triggerDownload(ed.downloadUrl,ed.outputName));};
  }
  setProcessingProgress("edit",100,"Ready");
  const b=$("#runBtn");
  if(b){b.disabled=false;b.classList.remove("is-processing","is-done");b.classList.add("editor-apply-ready");b.innerHTML="✓ Apply Edit";}
  const note=skippedObjects?` ${skippedObjects} unusual text item(s) could not be reconstructed.`:"";
  setStatus(`Edited PDF generated successfully: ${fmtBytes(ed.outputBytes.length)}.${note} Download is now enabled.`,skippedObjects?"":"success");
  return true;
}
// Convert character-level formatting into contiguous PDF text runs.
function buildStyledTextRuns(obj){
  const text=String(obj.text||"");
  const arr=Array.isArray(obj.charStyles)?obj.charStyles:[];
  const runs=[];let current=null;
  for(let i=0;i<text.length;i++){
    const st=arr[i]||{};
    const merged={
      bold:st.bold??(obj.weight==="bold"),
      italic:st.italic??(obj.weight==="italic"),
      underline:st.underline??!!obj.underline,
      color:st.color||obj.color||"#111827",
      fontSize:st.fontSize||obj.fontSize,
      fontChoice:st.fontChoice||obj.fontChoice,
      fontFamily:st.fontFamily||obj.fontFamily
    };
    const key=JSON.stringify(merged);
    if(!current||current.key!==key){current={key,text:"",...merged};runs.push(current)}
    current.text+=text[i];
  }
  return runs.length?runs:[{text:"",bold:obj.weight==="bold",italic:obj.weight==="italic",underline:!!obj.underline,color:obj.color,fontSize:obj.fontSize,fontChoice:obj.fontChoice,fontFamily:obj.fontFamily}];
}
function mapPdfFont(obj){
  const family=String(obj.fontFamily||obj.fontChoice||"").toLowerCase();
  const bold=obj.weight==="bold"||obj.bold===true;
  const italic=obj.weight==="italic"||obj.italic===true;
  if(/courier|mono/.test(family)){if(bold)return StandardFonts.CourierBold;if(italic)return StandardFonts.CourierOblique;return StandardFonts.Courier}
  if(/times|serif|cambria|georgia|roman/.test(family)){if(bold)return StandardFonts.TimesRomanBold;if(italic)return StandardFonts.TimesRomanItalic;return StandardFonts.TimesRoman}
  if(bold)return StandardFonts.HelveticaBold;if(italic)return StandardFonts.HelveticaOblique;return StandardFonts.Helvetica;
}
function pdfTextWidth(text,font,size){try{return font.widthOfTextAtSize(String(text||""),size)}catch{return String(text||"").length*size*.55}}
function hexRgb(hex){const h=String(hex).replace("#","");const n=parseInt(h.length===3?h.split("").map(x=>x+x).join(""):h,16)||0;return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255]}
function base64ToBytes(data){const b=data.split(",")[1]||"";const bin=atob(b);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function sampleTextColor(canvas,x,y,w,h,bg){
  try{
    const ctx=canvas.getContext("2d"),W=canvas.width,H=canvas.height;
    const l=Math.max(0,Math.floor(x)),r=Math.min(W-1,Math.ceil(x+w)),t=Math.max(0,Math.floor(y)),b=Math.min(H-1,Math.ceil(y+h));
    const data=ctx.getImageData(l,t,Math.max(1,r-l+1),Math.max(1,b-t+1)).data;
    const counts=new Map();
    for(let i=0;i<data.length;i+=4){const a=data[i+3];if(a<80)continue;const rr=data[i],gg=data[i+1],bb=data[i+2];const brightness=(rr+gg+bb)/3;
      if(brightness>235)continue;
      const k=`${Math.round(rr/8)*8},${Math.round(gg/8)*8},${Math.round(bb/8)*8}`;counts.set(k,(counts.get(k)||0)+1);}
    let best=null,n=0;for(const [k,v] of counts)if(v>n){n=v;best=k}
    if(!best)return "#111827";const [rr,gg,bb]=best.split(",").map(Number);return `#${[rr,gg,bb].map(v=>Math.min(255,v).toString(16).padStart(2,"0")).join("")}`;
  }catch{return "#111827"}
}
function sampleMaskColor(canvas,x,y,w,h){
  try{
    const ctx=canvas.getContext("2d"),W=canvas.width,H=canvas.height;
    const pts=[];
    const l=Math.max(0,Math.floor(x-2)),r=Math.min(W-1,Math.ceil(x+w+2)),t=Math.max(0,Math.floor(y-2)),b=Math.min(H-1,Math.ceil(y+h+2));
    for(let xx=l;xx<=r;xx+=Math.max(1,Math.floor((r-l)/12)||1)){pts.push([xx,t]);pts.push([xx,b])}
    for(let yy=t;yy<=b;yy+=Math.max(1,Math.floor((b-t)/8)||1)){pts.push([l,yy]);pts.push([r,yy])}
    const counts=new Map();
    for(const [px,py] of pts){const d=ctx.getImageData(px,py,1,1).data;if(d[3]<20)continue;const k=`${d[0]},${d[1]},${d[2]}`;counts.set(k,(counts.get(k)||0)+1)}
    let best="255,255,255",n=-1;for(const [k,v] of counts)if(v>n){n=v;best=k}
    const [rr,gg,bb]=best.split(",").map(Number);return `#${[rr,gg,bb].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
  }catch{return "#ffffff"}
}
// ============================================================
// EDITOR UI BINDINGS
// Keep toolbar/button wiring here so it is easy to find and edit.
// ============================================================
async function bindEditor(){
  const input=$("#editorEmpty #toolInput");
  if(input){input.onchange=()=>openEditorFile(input.files?.[0]);const drop=$("#editorEmpty #toolDrop");bindDrop(drop,input,false,"edit")}
  $("#editorZoomIn")?.addEventListener("click",()=>editorZoom(1.12));
  $("#editorZoomOut")?.addEventListener("click",()=>editorZoom(.89));
  $("#editorFit")?.addEventListener("click",()=>fitEditorPage());
  $("#editorPrev")?.addEventListener("click",()=>goEditorPage((state.editor?.page||1)-1));
  $("#editorNext")?.addEventListener("click",()=>goEditorPage((state.editor?.page||1)+1));
  $("#editorPageInput")?.addEventListener("change",e=>goEditorPage(+e.target.value));
  $("#editorClear")?.addEventListener("click",()=>goHome());
  $("#editorHome")?.addEventListener("click",()=>goHome());
  $("#editorUndo")?.addEventListener("click",()=>document.execCommand("undo"));
  $("#editorRedo")?.addEventListener("click",()=>document.execCommand("redo"));
  $("#editorImageInput")?.addEventListener("change",()=>{const f=$("#editorImageInput").files?.[0];if(f)insertEditorImage(f)});
  // Keep the document selection alive while toolbar controls are clicked.
  document.addEventListener("selectionchange",()=>{
    const sel=captureEditorSelection();
    if(sel&&state.editor)state.editor.lastSelection=sel;
  });
  ["#editorBold","#editorItalic","#editorUnderline"].forEach(sel=>$(sel)?.addEventListener("mousedown",e=>{
    const current=captureEditorSelection();
    if(current&&state.editor)state.editor.lastSelection=current;
    e.preventDefault();
  }));
  $("#editorFontSize")?.addEventListener("mousedown",()=>{
    const current=captureEditorSelection();
    if(current&&state.editor)state.editor.lastSelection=current;
  });
  $("#editorFontSize")?.addEventListener("change",e=>applyInlineFormat("fontSize",+e.target.value));
  $("#editorBold")?.addEventListener("click",()=>toggleInlineFormat("bold"));
  $("#editorItalic")?.addEventListener("click",()=>toggleInlineFormat("italic"));
  $("#editorUnderline")?.addEventListener("click",()=>toggleInlineFormat("underline"));
  $("#editorTextColor")?.addEventListener("pointerdown",()=>{const current=captureEditorSelection();if(current&&state.editor)state.editor.lastSelection=current});
  $("#editorTextColor")?.addEventListener("input",e=>applyInlineFormat("color",e.target.value));
  $$('[data-edit-tool]').forEach(b=>b.addEventListener('click',()=>setEditorTool(b.dataset.editTool)));
  if(state.files[0])await openEditorFile(state.files[0]);
}
async function openEditorFile(file){
  if(!file)return;
  state.files=[file];
  document.body.classList.add("nexapdf-editor-mode");
  try{
    const data=await readBytes(file),task=pdfjsLib.getDocument({data,disableWorker:true}),pdf=await task.promise;
    const ed={pdf,sourceFile:file,pages:[],page:1,zoom:1,fitScale:1,history:[],future:[],outputBytes:null,outputName:"",downloadBlob:null,downloadUrl:null};state.editor=ed;selectedEditorObject=null;
    const directDownload=$("#"+EDITOR_DOWNLOAD_BUTTON_ID);
    if(directDownload){directDownload.href="#";directDownload.download="edited.pdf";directDownload.classList.add("disabled");directDownload.setAttribute("aria-disabled","true");directDownload.title="Apply edits first to enable download";}
    $("#editorEmpty")?.classList.add("hidden");$("#editorCanvasArea")?.classList.remove("hidden");
    $("#editorFileName").textContent=file.name;$("#editorFileNameTop").textContent=file.name;$("#editorInfo").textContent=`${pdf.numPages} pages • ${fmtBytes(file.size)}`;$("#editorPageCount").textContent=pdf.numPages;$("#editorPageCountSide").textContent=pdf.numPages;
    setStatus("Reading document layout…");
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i),vp=page.getViewport({scale:1}),tc=await page.getTextContent({disableCombineTextItems:false});
      const objects=buildEditableTextObjects(tc,vp,i);
      ed.pages.push({page,objects,width:vp.width,height:vp.height});
    }
    await renderEditorThumbs();
    await renderEditorPages();
    fitEditorPage();
    setStatus("Document ready. Click any text and edit it directly on the page.","success");
  }catch(e){console.error(e);setStatus("Could not open this PDF for editing: "+e.message,"error")}
}
function buildEditableTextObjects(tc,vp,pageNo){
  const items=(tc.items||[]).filter(x=>typeof x.str==="string"&&x.str.trim());
  const styles=tc.styles||{};
  const placed=[];
  for(const item of items){
    const tr=pdfjsLib.Util.transform(vp.transform,item.transform);
    const x=tr[4], baseline=tr[5];
    const fontH=Math.max(4,Math.sqrt((tr[2]||0)**2+(tr[3]||0)**2));
    const y=Math.max(0,baseline-fontH);
    const w=Math.max(1,Math.abs(item.width||tr[0]||0));
    const style=styles[item.fontName]||{};
    const family=String(style.fontFamily||"");
    const fontTag=String(item.fontName||"")+" "+family;
    const weight=/bold|black|heavy/i.test(fontTag)?"bold":/italic|oblique/i.test(fontTag)?"italic":"normal";
    const fontFamily=/courier|mono/i.test(family)?"Courier New":/times|serif|roman/i.test(family)?"Times New Roman":"Arial";
    let line=placed.find(l=>Math.abs(l.baseline-baseline)<=Math.max(2.5,fontH*.30)&&x>=l.lastX-Math.max(8,fontH*1.8));
    if(!line){line={items:[],x,y,lastX:x,baseline,fontH,style,maskColor:"#ffffff"};placed.push(line)}
    line.items.push({item,x,y,w,fontH,style});
    line.lastX=Math.max(line.lastX,x+w);
    line.x=Math.min(line.x,x);line.y=Math.min(line.y,y);line.fontH=Math.max(line.fontH,fontH);
  }
  placed.sort((a,b)=>a.y-b.y||a.x-b.x);
  return placed.map((line,j)=>{
    const sorted=line.items.sort((a,b)=>a.x-b.x);
    let text="";
    for(let k=0;k<sorted.length;k++){
      const part=sorted[k],prev=sorted[k-1];
      if(k&&part.x-(prev.x+prev.w)>Math.max(1,line.fontH*.22))text+=" ";
      text+=part.item.str;
    }
    const style=line.style||{},family=String(style.fontFamily||"");
    const fontChoice=/courier|mono/i.test(family)?"Courier":/times|serif|roman/i.test(family)?"Times":"Helvetica";
    const weight=/bold|black|heavy/i.test(family)?"bold":/italic|oblique/i.test(family)?"italic":"normal";
    const fontSize=Math.max(5,line.fontH);
    return {id:`p${pageNo}t${j}`,kind:"text",text,original:text,pdfX:line.x,pdfYTop:line.y,pdfW:Math.max(8,line.lastX-line.x),pdfH:Math.max(7,fontSize*1.28),fontSize,color:"#111827",fontChoice,fontFamily:style.fontFamily||"",weight,underline:false,align:"left",added:false,changed:false,originalX:line.x,originalYTop:line.y,originalW:Math.max(8,line.lastX-line.x),originalH:Math.max(7,fontSize*1.28),originalFontSize:fontSize,originalFontChoice:fontChoice,originalWeight:weight,originalUnderline:false,originalColor:"#111827",maskColor:line.maskColor,charStyles:[]};
  });
}
async function renderEditorThumbs(){
  const ed=state.editor,m=$("#editorThumbs");if(!m)return;m.innerHTML="";
  for(let i=1;i<=ed.pages.length;i++){
    const b=document.createElement("button");b.className="editor-thumb"+(i===ed.page?" active":"");b.dataset.page=i;b.innerHTML=`<span class="thumb-num">${i}</span><canvas></canvas>`;b.onclick=()=>goEditorPage(i);m.appendChild(b);
    const p=ed.pages[i-1].page,v=p.getViewport({scale:.19}),c=$("canvas",b);c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await p.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
  }
}
async function renderEditorPages(){
  const ed=state.editor;if(!ed)return;const area=$("#editorCanvasArea");area.innerHTML="";
  for(let i=0;i<ed.pages.length;i++){
    const model=ed.pages[i],vp=model.page.getViewport({scale:ed.zoom});
    const wrap=document.createElement("section");wrap.className="editor-page-wrap";wrap.dataset.page=i+1;wrap.style.width=vp.width+"px";wrap.style.height=vp.height+"px";
    const canvas=document.createElement("canvas");canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);canvas.className="editor-page-bg";await model.page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;wrap.appendChild(canvas);
    const layer=document.createElement("div");layer.className="editor-object-layer";
    for(const obj of model.objects){
      if(obj.kind==="text") {
        obj.maskColor=sampleMaskColor(canvas,obj.originalX*ed.zoom,obj.originalYTop*ed.zoom,obj.originalW*ed.zoom,obj.originalH*ed.zoom);
        if(!obj.added && !obj.changed) obj.color=sampleTextColor(canvas,obj.pdfX*ed.zoom,obj.pdfYTop*ed.zoom,obj.pdfW*ed.zoom,obj.pdfH*ed.zoom,obj.maskColor);
      }
    }
    // Mask original text regions first, then place editable text above the masks. This removes the duplicate-glyph problem in the live editor.
    for(const obj of model.objects){if(obj.kind==="text")addEditorTextMask(layer,obj,ed.zoom)}
    model.objects.forEach(obj=>addEditorObject(wrap,layer,obj,ed.zoom));wrap.appendChild(layer);area.appendChild(wrap);
  }
  const observer=new IntersectionObserver(entries=>{const visible=entries.filter(x=>x.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(visible){ed.page=+visible.target.dataset.page;syncEditorNavigation()}},{root:$(".editor-stage"),threshold:[.15,.4,.7]});
  $$(".editor-page-wrap",area).forEach(p=>observer.observe(p));ed.pageObserver=observer;syncEditorNavigation();
}
function syncEditorNavigation(){const ed=state.editor;if(!ed)return;$("#editorPageInput").value=ed.page;$$('.editor-thumb').forEach((b,i)=>b.classList.toggle('active',i===ed.page-1));$("#editorPageCount").textContent=ed.pages.length;$("#editorPageCountSide").textContent=ed.pages.length;$("#editorZoomLabel").textContent=Math.round(ed.zoom*100)+"%";const t=$(".editor-thumb.active");t?.scrollIntoView({block:"nearest",behavior:"smooth"});syncFormatToolbar()}
function goEditorPage(n){const ed=state.editor;if(!ed)return;n=Math.max(1,Math.min(ed.pages.length,Number(n)||1));ed.page=n;const el=$(`.editor-page-wrap[data-page="${n}"]`);el?.scrollIntoView({behavior:"smooth",block:"start"});syncEditorNavigation()}
function fitEditorPage(){const ed=state.editor,stage=$(".editor-stage");if(!ed||!stage||!ed.pages.length)return;const page=ed.pages[ed.page-1];const available=Math.max(320,stage.clientWidth-96);ed.zoom=Math.max(.55,Math.min(1.35,available/page.width));renderEditorPages().then(()=>goEditorPage(ed.page))}
function addEditorObjectElement(obj,scale){const el=document.createElement("div");el.dataset.objectId=obj.id;el.className="editor-object";el.style.left=(obj.pdfX*scale)+"px";el.style.top=(obj.pdfYTop*scale)+"px";el.style.width=Math.max(8,obj.pdfW*scale)+"px";el.style.minHeight=Math.max(7,obj.pdfH*scale)+"px";return el}
function addEditorTextMask(layer,obj,scale){
  const el=document.createElement("div");el.className="editor-text-mask";el.style.left=(obj.originalX*scale)+"px";el.style.top=(obj.originalYTop*scale)+"px";el.style.width=Math.max(2,obj.originalW*scale)+"px";el.style.height=Math.max(2,obj.originalH*scale)+"px";el.style.background=obj.maskColor||"#fff";layer.appendChild(el);
}
function addEditorObject(wrap,layer,obj,scale){
 const el=addEditorObjectElement(obj,scale);
 if(obj.kind==="text"){
   el.classList.add("editor-text-object");el.contentEditable="true";el.spellcheck=false;el.style.fontSize=Math.max(5,obj.fontSize*scale)+"px";el.style.color=obj.color;el.style.fontFamily=obj.fontChoice==="Times"?"Times New Roman":obj.fontChoice==="Courier"?"Courier New":(obj.fontFamily||"Arial");el.style.fontWeight=obj.weight==="bold"?"700":"400";el.style.fontStyle=obj.weight==="italic"?"italic":"normal";el.style.textDecoration=obj.underline?"underline":"none";el.style.textAlign=obj.align||"left";renderInlineText(el,obj);el.title="Click and type directly";
   el.oninput=()=>{const oldLen=String(obj.text||"").length;obj.text=el.innerText.replace(/\n+$/g,"");if(obj.text.length!==oldLen) obj.charStyles=[];normalizeCharStyles(obj);obj.pdfW=Math.max(obj.pdfW,el.scrollWidth/scale);obj.pdfH=Math.max(obj.pdfH,el.scrollHeight/scale);obj.changed=true;state.editor.lastSelection=captureEditorSelection()||state.editor.lastSelection;el.classList.toggle("changed",obj.changed)};
   el.onfocus=()=>{el.classList.add("editing");selectedEditorObject=obj;syncFormatToolbar()};el.onblur=()=>{el.classList.remove("editing");obj.changed=obj.text!==obj.original||obj.pdfX!==obj.originalX||obj.pdfYTop!==obj.originalYTop||obj.fontSize!==obj.originalFontSize||obj.weight!==obj.originalWeight||obj.underline!==obj.originalUnderline||obj.color!==obj.originalColor||!!(obj.charStyles&&obj.charStyles.length);el.classList.toggle("changed",obj.changed)};
   el.onmouseup=()=>{selectedEditorObject=obj;const sel=captureEditorSelection();if(sel&&state.editor)state.editor.lastSelection=sel};
   el.onkeyup=()=>{selectedEditorObject=obj;const sel=captureEditorSelection();if(sel&&state.editor)state.editor.lastSelection=sel};
   el.onclick=e=>{e.stopPropagation();selectedEditorObject=obj;selectEditorObject(obj,el);const sel=captureEditorSelection();if(sel&&state.editor)state.editor.lastSelection=sel;syncFormatToolbar()};
 } else if(obj.kind==="image") {el.classList.add("editor-image-object");const img=document.createElement("img");img.src=obj.data;img.draggable=false;img.style.width="100%";img.style.height="100%";img.style.objectFit="contain";el.appendChild(img)}
 else if(obj.kind==="rect") el.classList.add("editor-shape-object");
 else if(obj.kind==="line") {el.classList.add("editor-line-object");el.style.width=Math.max(10,obj.pdfW*scale)+"px";el.style.height="2px";el.style.transform=`rotate(${Math.atan2(-obj.pdfH,obj.pdfW)*180/Math.PI}deg)`}
 el.onpointerdown=e=>{if(e.button!==undefined&&e.button!==0)return;if(editorTool==="delete"){e.preventDefault();removeEditorObject(obj.id);return}selectEditorObject(obj,el);if(obj.kind!=="text"){e.preventDefault();dragEditorObject(e,el,obj,scale)}else if(e.altKey){e.preventDefault();dragEditorObject(e,el,obj,scale)}};
 layer.appendChild(el);
}
let editorTool="select", selectedEditorObject=null;
function setEditorTool(t){editorTool=t;$$('[data-edit-tool]').forEach(b=>b.classList.toggle('active',b.dataset.editTool===t));if(t==='image')$("#editorImageInput")?.click();else if(t==='text')addEditorText();else if(t==='rect'||t==='line')addEditorShape(t)}
function selectEditorObject(obj,el){selectedEditorObject=obj;$$('.editor-object').forEach(x=>x.classList.remove('selected'));el?.classList.add('selected');syncFormatToolbar()}
function syncFormatToolbar(){const o=selectedEditorObject;if(!o||o.kind!=="text"){return}const fs=$("#editorFontSize"),c=$("#editorTextColor");if(fs)fs.value=String(Math.round(o.fontSize||18));if(c)c.value=/^#[0-9a-f]{6}$/i.test(o.color||"")?o.color:"#111827";$("#editorBold")?.classList.toggle("on",o.weight==="bold");$("#editorItalic")?.classList.toggle("on",o.weight==="italic");$("#editorUnderline")?.classList.toggle("on",!!o.underline)}
function getSelectedTextObject(){return selectedEditorObject?.kind==="text"?selectedEditorObject:null}
function textOffset(root,node,offset){
  let total=0,walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
  while(n=walker.nextNode()){
    if(n===node)return total+offset;
    total+=(n.nodeValue||"").length;
  }
  return total;
}
function captureEditorSelection(){
  const o=getSelectedTextObject(),sel=window.getSelection();
  if(!o||!sel||!sel.rangeCount)return null;
  const root=document.querySelector(`[data-object-id="${CSS.escape(o.id)}"]`);
  if(!root||!root.contains(sel.anchorNode)||!root.contains(sel.focusNode))return null;
  let a=textOffset(root,sel.anchorNode,sel.anchorOffset),b=textOffset(root,sel.focusNode,sel.focusOffset);if(a>b)[a,b]=[b,a];
  return {objId:o.id,start:a,end:b};
}
function normalizeCharStyles(o){
  const n=String(o.text||"").length;
  if(!Array.isArray(o.charStyles))o.charStyles=[];
  o.charStyles.length=n;
  for(let i=0;i<n;i++)if(!o.charStyles[i])o.charStyles[i]={};
}
function renderInlineText(el,o,selection=null){
  normalizeCharStyles(o);el.innerHTML="";
  const text=String(o.text||"");
  let i=0;
  while(i<text.length){
    const st=o.charStyles[i]||{};let j=i+1;
    const key=JSON.stringify(st);while(j<text.length&&JSON.stringify(o.charStyles[j]||{})===key)j++;
    const span=document.createElement("span");span.textContent=text.slice(i,j);span.style.fontWeight=(st.bold??(o.weight==="bold"))?"700":"400";span.style.fontStyle=(st.italic??(o.weight==="italic"))?"italic":"normal";span.style.textDecoration=(st.underline??o.underline)?"underline":"none";span.style.color=st.color||o.color;span.style.fontSize=(st.fontSize||o.fontSize)*state.editor.zoom+"px";el.appendChild(span);i=j;
  }
  if(!text)el.textContent="";
  if(selection){
    const range=document.createRange();let startNode=null,endNode=null,startOffset=0,endOffset=0;let pos=0;
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
    while(n=walker.nextNode()){const next=pos+n.nodeValue.length;if(startNode===null&&selection.start>=pos&&selection.start<=next){startNode=n;startOffset=selection.start-pos}if(endNode===null&&selection.end>=pos&&selection.end<=next){endNode=n;endOffset=selection.end-pos;break}pos=next}
    if(startNode&&endNode){range.setStart(startNode,startOffset);range.setEnd(endNode,endOffset);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);el.focus();}
  }
}
function applyInlineFormat(prop,val){
  const o=getSelectedTextObject();if(!o)return;
  const saved=(state.editor&&state.editor.lastSelection?.objId===o.id)?state.editor.lastSelection:captureEditorSelection();if(!saved||saved.start===saved.end)return;
  normalizeCharStyles(o);
  for(let i=saved.start;i<saved.end;i++){
    const st=o.charStyles[i]||{};
    if(prop==="fontSize")st.fontSize=+val;
    else if(prop==="color")st.color=val;
    o.charStyles[i]=st;
  }
  o.changed=true;state.editor.lastSelection=saved;
  const el=document.querySelector(`[data-object-id="${CSS.escape(o.id)}"]`);if(el)renderInlineText(el,o,saved);
  syncFormatToolbar();
}
function toggleInlineFormat(prop){
  const o=getSelectedTextObject();if(!o)return;
  const saved=(state.editor&&state.editor.lastSelection?.objId===o.id)?state.editor.lastSelection:captureEditorSelection();if(!saved||saved.start===saved.end)return;
  normalizeCharStyles(o);
  const allOn=Array.from({length:saved.end-saved.start},(_,k)=>o.charStyles[saved.start+k]?.[prop]??(prop==="bold"?o.weight==="bold":prop==="italic"?o.weight==="italic":o.underline)).every(Boolean);
  for(let i=saved.start;i<saved.end;i++){const st=o.charStyles[i]||{};st[prop]=!allOn;o.charStyles[i]=st}
  o.changed=true;state.editor.lastSelection=saved;
  const el=document.querySelector(`[data-object-id="${CSS.escape(o.id)}"]`);if(el)renderInlineText(el,o,saved);
  syncFormatToolbar();
}
function removeEditorObject(id){const ed=state.editor;if(!ed)return;const m=ed.pages[ed.page-1];m.objects=m.objects.filter(o=>o.id!==id);const el=document.querySelector(`[data-object-id="${CSS.escape(id)}"]`);el?.remove();selectedEditorObject=null;syncFormatToolbar()}
function dragEditorObject(e,el,obj,scale){if(e.button!==undefined&&e.button!==0)return;if(obj.kind==='text'&&el.isContentEditable&&document.activeElement===el)return;const sx=e.clientX,sy=e.clientY,l=obj.pdfX,t=obj.pdfYTop;el.setPointerCapture?.(e.pointerId);const move=ev=>{obj.pdfX=Math.max(0,l+(ev.clientX-sx)/scale);obj.pdfYTop=Math.max(0,t+(ev.clientY-sy)/scale);obj.changed=true;el.style.left=obj.pdfX*scale+'px';el.style.top=obj.pdfYTop*scale+'px'};const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up)};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true})}
function addEditorText(){const ed=state.editor;if(!ed)return;const model=ed.pages[ed.page-1],id=`p${ed.page}new${Date.now()}`,obj={id,kind:'text',text:'Type here',original:'',pdfX:model.width*.18,pdfYTop:model.height*.18,pdfW:180,pdfH:30,fontSize:18,color:'#172033',fontChoice:'Helvetica',fontFamily:'Arial',weight:'normal',underline:false,align:'left',added:true,changed:true,originalX:model.width*.18,originalYTop:model.height*.18,originalW:180,originalH:30,originalFontSize:18,originalFontChoice:'Helvetica',originalWeight:'normal',originalUnderline:false,originalColor:'#172033',maskColor:'#ffffff'};model.objects.push(obj);selectedEditorObject=obj;renderEditorPages().then(()=>{goEditorPage(ed.page);const el=$(`[data-object-id="${id}"]`);if(el){el.focus();const r=document.createRange();r.selectNodeContents(el);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r)}})}
function addEditorShape(kind){const ed=state.editor;if(!ed)return;const model=ed.pages[ed.page-1],id=`p${ed.page}${kind}${Date.now()}`,obj={id,kind,text:'',original:'',pdfX:model.width*.18,pdfYTop:model.height*.3,pdfW:150,pdfH:60,added:true};model.objects.push(obj);selectedEditorObject=obj;renderEditorPages().then(()=>goEditorPage(ed.page))}
async function insertEditorImage(file){const ed=state.editor;if(!ed)return;const reader=new FileReader();reader.onload=()=>{const model=ed.pages[ed.page-1],id=`p${ed.page}img${Date.now()}`,obj={id,kind:'image',data:reader.result,mime:file.type,pdfX:model.width*.18,pdfYTop:model.height*.18,pdfW:180,pdfH:120,added:true};model.objects.push(obj);selectedEditorObject=obj;renderEditorPages().then(()=>goEditorPage(ed.page))};reader.readAsDataURL(file)}
function editorZoom(f){const ed=state.editor;if(!ed)return;ed.zoom=Math.max(.55,Math.min(2.5,ed.zoom*f));const current=ed.page;renderEditorPages().then(()=>goEditorPage(current))}

async function watermark(){
  if(!ensureFiles())return;const pdf=await loadPdf(state.files[0]);const font=await pdf.embedFont(StandardFonts.HelveticaBold),text=$("#wmText").value||"WATERMARK",size=+$("#wmSize").value,opacity=+$("#wmOpacity").value,angle=+$("#wmAngle").value;
  pdf.getPages().forEach(p=>{const {width,height}=p.getSize();p.drawText(text,{x:width*.18,y:height*.48,size,font,color:rgb(.25,.28,.35),opacity,rotate:degrees(angle)})});
  downloadBytes(await pdf.save(),"watermarked.pdf");setStatus("Done.","success");
}
async function pageNumbers(){
  if(!ensureFiles())return;const pdf=await loadPdf(state.files[0]);const font=await pdf.embedFont(StandardFonts.Helvetica),pos=$("#numPos").value,start=+$("#numStart").value,fmt=$("#numFormat").value||"Page {n}";
  pdf.getPages().forEach((p,i)=>{const {width,height}=p.getSize(),text=fmt.replace("{n}",start+i),size=10;let x=width/2-text.length*2.5,y=18;if(pos==="bottom-right"){x=width-50-text.length*5}else if(pos==="bottom-left")x=20;else if(pos==="top-center")y=height-25;p.drawText(text,{x,y,size,font,color:rgb(.25,.28,.35)})});
  downloadBytes(await pdf.save(),"numbered.pdf");setStatus("Done.","success");
}
async function cropPdf(){
  if(!ensureFiles())return;const pdf=await loadPdf(state.files[0]),l=+$("#cropL").value,r=+$("#cropR").value,t=+$("#cropT").value,b=+$("#cropB").value;
  pdf.getPages().forEach(p=>{const {width,height}=p.getSize();const nw=Math.max(1,width-l-r),nh=Math.max(1,height-t-b);p.setCropBox(l,b,nw,nh)});
  downloadBytes(await pdf.save(),"cropped.pdf");setStatus("Done.","success");
}
async function resizePdf(){
  if(!ensureFiles())return;const pdf=await loadPdf(state.files[0]);const paper=$("#paper").value,orient=$("#orient").value;
  let w,h;if(paper==="a4"){w=595.28;h=841.89}else if(paper==="letter"){w=612;h=792}else{w=+$("#customW").value;h=+$("#customH").value}
  if(orient==="landscape")[w,h]=[h,w];
  pdf.getPages().forEach(p=>{const ow=p.getWidth(),oh=p.getHeight(),sx=w/ow,sy=h/oh,s=Math.min(sx,sy);p.setSize(w,h);p.scaleContent(s,s);p.translateContent((w-ow*s)/2,(h-oh*s)/2)});
  downloadBytes(await pdf.save(),"resized.pdf");setStatus("Done.","success");
}
/* ============================================================
   IMAGE RESIZE TOOL
   Browser-only, high-quality image resizing with pixel, print-size,
   percentage and DPI controls. Multiple images download as one ZIP.
   ============================================================ */
function bindImageResizeTool(){
  const aspect=$("#imageResizeAspect"),w=$("#imageResizeW"),h=$("#imageResizeH"),slider=$("#imageTargetSizeSlider"),label=$("#imageTargetSizeLabel"),dpi=$("#imageResizeDpi"),customDpi=$("#imageCustomDpi"),customDpiField=$("#imageCustomDpiField"),format=$("#imageResizeFormat");
  let targetUnit="mb",syncing=false; window.__amarImageTargetUnit=targetUnit;
  // Target-size slider: 5 KB minimum so users can prepare strict form/visa uploads.
  // Internally we always work in bytes; the unit switch only changes the display scale.
  const targetBytes=()=>Math.max(5*1024,Math.round((+slider.value||1)*(targetUnit==="mb"?1048576:1024)));
  const refresh=()=>{const b=targetBytes();label.textContent=b>=1048576?`${(b/1048576).toFixed(b<10485760?2:1)} MB`:`${Math.max(5,Math.round(b/1024))} KB`;window.__amarImageTargetUnit=targetUnit;$("#imageResizeResolution").textContent=label.textContent;updateImageResizeSummary()};
  $$(".size-unit").forEach(btn=>btn.addEventListener("click",()=>{const old=targetBytes();targetUnit=btn.dataset.unit;$$('.size-unit').forEach(b=>b.classList.toggle('active',b===btn));if(targetUnit==='mb'){slider.min='.005';slider.max='20';slider.step='.005';slider.value=Math.min(20,Math.max(.005,old/1048576))}else{slider.min='5';slider.max='20480';slider.step='1';slider.value=Math.min(20480,Math.max(5,old/1024))}$("#imageTargetMin").textContent=targetUnit==='mb'?'5 KB':'5 KB';$("#imageTargetMax").textContent=targetUnit==='mb'?'20 MB':'20 MB';refresh()}));
  slider.addEventListener('input',refresh);
  const syncH=()=>{if(syncing||!aspect.checked||!+w.value)return;const img=getFirstImageDimensions();if(!img)return;syncing=true;h.value=Math.max(1,Math.round(+w.value*img.height/img.width));syncing=false};
  const syncW=()=>{if(syncing||!aspect.checked||!+h.value)return;const img=getFirstImageDimensions();if(!img)return;syncing=true;w.value=Math.max(1,Math.round(+h.value*img.width/img.height));syncing=false};
  aspect.addEventListener('change',()=>{if(aspect.checked)syncH();updateImageResizeSummary()});w.addEventListener('input',()=>{syncH();updateImageResizeSummary()});h.addEventListener('input',()=>{syncW();updateImageResizeSummary()});
  dpi.addEventListener('change',()=>{customDpiField.classList.toggle('hidden',dpi.value!=='custom');updateImageResizeSummary()});customDpi.addEventListener('input',updateImageResizeSummary);format.addEventListener('change',updateImageResizeSummary);refresh();
}

function getFirstImageDimensions(){
  const f=state.files.find(file=>/^image\//i.test(file.type)||/\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name));
  return f?f.__amarDimensions||null:null;
}

async function readImageSource(file){
  if("createImageBitmap" in window){
    try{
      const bitmap=await createImageBitmap(file,{imageOrientation:"from-image",premultiplyAlpha:"default",colorSpaceConversion:"default"});
      return {source:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};
    }catch{}
  }
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error("Could not read image."));el.src=url});
    return {source:img,width:img.naturalWidth,height:img.naturalHeight,close:()=>{}};
  }finally{setTimeout(()=>URL.revokeObjectURL(url),0)}
}

async function cacheImageDimensions(files){
  for(const file of files){
    if(file.__amarDimensions)continue;
    try{const source=await readImageSource(file);file.__amarDimensions={width:source.width,height:source.height};source.close();}
    catch{}
  }
}


function updateImageResizeSummary(){
  const original=$("#imageResizeOriginal"),output=$("#imageResizeOutput"),resolution=$("#imageResizeResolution");if(!original)return;const imgs=state.files.filter(f=>/^image\//i.test(f.type)||/\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
  if(!imgs.length){original.textContent="Choose images";output.textContent="—";resolution.textContent="—";return}
  const first=imgs[0].__amarDimensions;original.textContent=first?`${first.width} × ${first.height}px${imgs.length>1?` • ${imgs.length} images`:""}`:`${imgs.length} image${imgs.length>1?"s":""}`;const w=+$("#imageResizeW")?.value||first?.width||0,h=+$("#imageResizeH")?.value||first?.height||0;output.textContent=w&&h?`${w} × ${h}px`:`Original size`;resolution.textContent=$("#imageTargetSizeLabel")?.textContent||"—";
}

function writeU16(view,offset,value){view.setUint16(offset,value,false)}
function writeU32(view,offset,value){view.setUint32(offset,value,false)}
function makeJpegDpi(bytes,dpi){
  if(bytes[0]!==0xFF||bytes[1]!==0xD8)return bytes;
  const tiff=new Uint8Array(66),v=new DataView(tiff.buffer);
  tiff[0]=0x4D;tiff[1]=0x4D;writeU16(v,2,0x002A);writeU32(v,4,8);writeU16(v,8,3);
  // XResolution
  writeU16(v,10,0x011A);writeU16(v,12,5);writeU32(v,14,1);writeU32(v,18,50);
  // YResolution
  writeU16(v,22,0x011B);writeU16(v,24,5);writeU32(v,26,1);writeU32(v,30,58);
  // ResolutionUnit = inches
  writeU16(v,34,0x0128);writeU16(v,36,3);writeU32(v,38,1);writeU16(v,42,2);
  writeU32(v,46,0);writeU32(v,50,Math.round(dpi));writeU32(v,54,1);writeU32(v,58,Math.round(dpi));writeU32(v,62,1);
  const exif=new Uint8Array(6+tiff.length);exif.set([0x45,0x78,0x69,0x66,0,0],0);exif.set(tiff,6);
  const segment=new Uint8Array(4+exif.length);segment.set([0xFF,0xE1],0);const len=exif.length+2;segment[2]=(len>>8)&255;segment[3]=len&255;segment.set(exif,4);
  const out=new Uint8Array(bytes.length+segment.length);out.set(bytes.slice(0,2),0);out.set(segment,2);out.set(bytes.slice(2),2+segment.length);return out;
}
function crc32(bytes){
  let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++){c^=bytes[i];for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xEDB88320:0)}return (c^0xFFFFFFFF)>>>0;
}
function makePngDpi(bytes,dpi){
  const sig=[137,80,78,71,13,10,26,10];if(sig.some((v,i)=>bytes[i]!==v))return bytes;
  const ppm=Math.max(1,Math.round(dpi/0.0254)),data=new Uint8Array(9);const dv=new DataView(data.buffer);dv.setUint32(0,ppm);dv.setUint32(4,ppm);data[8]=1;
  const type=new Uint8Array([0x70,0x48,0x59,0x73]),crcData=new Uint8Array(13);crcData.set(type,0);crcData.set(data,4);const chunk=new Uint8Array(25),cv=new DataView(chunk.buffer);cv.setUint32(0,9);chunk.set(type,4);chunk.set(data,8);cv.setUint32(21,crc32(crcData));
  return new Uint8Array([...bytes.slice(0,33),...chunk,...bytes.slice(33)]);
}

async function imageToCanvas(file,targetW,targetH,outputFormat,quality){
  if(targetW<1||targetH<1||targetW>30000||targetH>30000)throw new Error("Output dimensions must be between 1 and 30,000 pixels.");
  if(targetW*targetH>50000000)throw new Error("Output image is too large. Keep the output below 50 megapixels.");
  const src=await readImageSource(file),canvas=document.createElement("canvas");
  canvas.width=targetW;canvas.height=targetH;
  const ctx=canvas.getContext("2d",{alpha:outputFormat!=="jpeg",willReadFrequently:false});
  if(!ctx)throw new Error("Your browser could not create an image canvas.");
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  if(outputFormat==="jpeg"){ctx.fillStyle="#ffffff";ctx.fillRect(0,0,targetW,targetH)}
  // Progressive downsampling gives noticeably cleaner results for large photo reductions.
  let source=src.source,sourceW=src.width,sourceH=src.height,temps=[];
  while(sourceW>targetW*2 || sourceH>targetH*2){
    const nextW=Math.max(targetW,Math.round(sourceW/2)),nextH=Math.max(targetH,Math.round(sourceH/2));
    const temp=document.createElement("canvas");temp.width=nextW;temp.height=nextH;
    const tc=temp.getContext("2d");tc.imageSmoothingEnabled=true;tc.imageSmoothingQuality="high";tc.drawImage(source,0,0,sourceW,sourceH,0,0,nextW,nextH);
    temps.push(temp);source=temp;sourceW=nextW;sourceH=nextH;
  }
  ctx.drawImage(source,0,0,sourceW,sourceH,0,0,targetW,targetH);
  temps.length=0;
  const mime=outputFormat==="png"?"image/png":outputFormat==="webp"?"image/webp":"image/jpeg";
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Image encoding failed in this browser.")),mime,quality));
  src.close();
  let bytes=new Uint8Array(await blob.arrayBuffer());
  const dpi=window.__amarImageDpi||96;
  if(outputFormat==="jpeg")bytes=makeJpegDpi(bytes,dpi);
  else if(outputFormat==="png")bytes=makePngDpi(bytes,dpi);
  return bytes;
}

function imageOutputFormat(file,choice,targetBytes=null){
  if(choice!=="auto")return choice;
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  // In target-size mode, keeping a PNG as PNG makes an arbitrary KB target impossible
  // because PNG encoding is lossless. Auto therefore chooses a photo-friendly lossy format
  // when the requested target is below the original size.
  if(targetBytes && file.size>targetBytes){
    if(ext==="png")return "webp";
    return "jpeg";
  }
  return ["png","webp","jpeg","jpg"].includes(ext)?(ext==="jpg"?"jpeg":ext):"jpeg";
}

function imageOutputName(name,format,index,total){
  const base=name.replace(/\.[^.]+$/,""),suffix=total>1?`-resized-${String(index+1).padStart(2,"0")}`:"-resized";
  return `${base}${suffix}.${format==="jpeg"?"jpg":format}`;
}

/*
 * Find the highest practical quality that stays at or below targetBytes.
 * If quality alone cannot reach the target, progressively reduce dimensions and
 * repeat the quality search. This is the important part that makes the target
 * size control functional instead of merely changing a label.
 */
async function encodeClosestToTarget(file,startW,startH,fmt,_userQuality,targetBytes,keepAspect){
  let tw=Math.max(1,Math.round(startW)),th=Math.max(1,Math.round(startH));
  // Target-size mode owns the quality decision. Do not cap it at the optional
  // "JPEG/WebP quality" preference, otherwise a 500 KB target can incorrectly
  // stop at a 100 KB file simply because quality 0.82 happened to be enough.
  const maxQuality=1;
  const minQuality=.05;
  let bestUnder=null,bestClosest=null;
  const remember=(bytes,q,w,h)=>{
    const item={bytes,q,w,h};
    if(!bestClosest || Math.abs(bytes.length-targetBytes)<Math.abs(bestClosest.bytes.length-targetBytes))bestClosest=item;
    if(bytes.length<=targetBytes && (!bestUnder || bytes.length>bestUnder.bytes.length))bestUnder=item;
  };

  for(let dimensionPass=0;dimensionPass<14;dimensionPass++){
    // Always test true maximum quality first. If it already fits, keep it:
    // that is the highest-quality result possible at these dimensions.
    let high=await imageToCanvas(file,tw,th,fmt,maxQuality);
    remember(high,maxQuality,tw,th);
    if(high.length<=targetBytes)return high;

    // Binary-search quality for this exact dimension.
    let lo=minQuality,hi=maxQuality;
    for(let pass=0;pass<9;pass++){
      const q=(lo+hi)/2;
      const bytes=await imageToCanvas(file,tw,th,fmt,q);
      remember(bytes,q,tw,th);
      if(bytes.length>targetBytes)hi=q;else lo=q;
    }
    if(bestUnder && bestUnder.w===tw && bestUnder.h===th)return bestUnder.bytes;

    // If even very low quality cannot meet the target, reduce pixels. Using the
    // square-root of the size ratio gives a much better next guess than fixed 10% steps.
    const current=(bestClosest && bestClosest.w===tw && bestClosest.h===th)?bestClosest.bytes.length:high.length;
    if(current<=targetBytes)return bestClosest.bytes;
    const ratio=Math.max(.08,Math.min(.88,Math.sqrt(targetBytes/current)*.92));
    let nextW=Math.max(1,Math.floor(tw*ratio));
    let nextH=keepAspect?Math.max(1,Math.floor(th*ratio)):Math.max(1,Math.floor(th*ratio));
    if(nextW===tw && nextH===th){nextW=Math.max(1,tw-1);nextH=Math.max(1,th-1)}
    tw=nextW;th=nextH;
    if(tw*th<4)break;
  }
  if(bestUnder)return bestUnder.bytes;
  // For an extremely small target, return the smallest practical result we could make.
  return bestClosest?.bytes || imageToCanvas(file,tw,th,fmt,minQuality);
}

async function resizeImages(){
  const imgs=state.files.filter(f=>/^image\//i.test(f.type)||/\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
  if(!imgs.length){setStatus("Choose one or more images first.","error");return}
  await cacheImageDimensions(imgs);
  const keep=$("#imageResizeAspect").checked;
  const choice=$("#imageResizeFormat").value;
  const quality=+$("#imageResizeQuality").value;
  const dpi=$("#imageResizeDpi").value==='custom'?Math.max(1,Math.min(2400,+$("#imageCustomDpi").value||300)):+$("#imageResizeDpi").value;
  const target=Math.max(5*1024,Math.round((+$("#imageTargetSizeSlider").value||1)*(window.__amarImageTargetUnit==='kb'?1024:1048576)));
  const outputs=[];

  for(let i=0;i<imgs.length;i++){
    const file=imgs[i],src=file.__amarDimensions;
    if(!src)throw new Error(`Could not read ${file.name}.`);
    let tw=+$("#imageResizeW").value||src.width,th=+$("#imageResizeH").value||src.height;
    if(keep){
      const r=src.width/src.height;
      if($("#imageResizeW").value&&!$("#imageResizeH").value)th=Math.max(1,Math.round(tw/r));
      else if($("#imageResizeH").value&&!$("#imageResizeW").value)tw=Math.max(1,Math.round(th*r));
      else if(tw/th>r)tw=Math.max(1,Math.round(th*r));
      else th=Math.max(1,Math.round(tw/r));
    }
    if(tw>30000||th>30000||tw*th>50000000)throw new Error("Output dimensions are too large. Keep the image below 50 megapixels.");
    const fmt=imageOutputFormat(file,choice,target);
    window.__amarImageDpi=dpi;
    setProcessingProgress("imageResize",Math.round(i/imgs.length*90),`Resizing ${i+1} of ${imgs.length}…`);

    let bytes;
    if(fmt==="png"){
      // PNG has no quality control. Explicit PNG means pixel resizing only.
      bytes=await imageToCanvas(file,tw,th,fmt,quality);
    }else if(file.size>target){
      // Real target-size optimization: quality search + dimension reduction.
      bytes=await encodeClosestToTarget(file,tw,th,fmt,quality,target,keep);
    }else{
      bytes=await imageToCanvas(file,tw,th,fmt,quality);
    }
    outputs.push({name:imageOutputName(file.name,fmt,i,imgs.length),bytes});
  }

  if(outputs.length===1){
    const mime=outputs[0].name.endsWith('.png')?'image/png':outputs[0].name.endsWith('.webp')?'image/webp':'image/jpeg';
    downloadBytes(outputs[0].bytes,outputs[0].name,mime);
    const actual=outputs[0].bytes.length;
    const targetReached=actual<=target;
    const src=imgs[0].__amarDimensions;
    const outW=+$("#imageResizeW").value||src?.width||0, outH=+$("#imageResizeH").value||src?.height||0;
    let detail;
    if(targetReached && actual < target * 0.80){
      detail=`${fmtBytes(actual)} is the maximum practical size at ${outW}×${outH}px with this format. A ${fmtBytes(target)} target cannot make the image larger without adding useless padding or increasing dimensions.`;
    }else if(targetReached){
      detail=`${fmtBytes(actual)} output — within the ${fmtBytes(target)} maximum.`;
    }else{
      detail=`Closest practical result is ${fmtBytes(actual)} for the ${fmtBytes(target)} maximum.`;
    }
    setStatus(`Done — ${outputs[0].name}: ${detail}`,"success");
  }else{
    if(!window.JSZip)throw new Error("ZIP engine did not load. Refresh and try again.");
    const zip=new JSZip();outputs.forEach(o=>zip.file(o.name,o.bytes));
    const zipBytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
    downloadBytes(zipBytes,"AmarPDF-resized-images.zip","application/zip");
    setStatus(`Done — ${outputs.length} resized images are ready in one ZIP.`,"success");
  }
}

function renderHomeFiles(files){
  const box=$("#homeFiles"),actions=$("#homeActions");if(!files.length){box.classList.add("hidden");actions.classList.add("hidden");box.innerHTML="";actions.innerHTML="";return}
  box.classList.remove("hidden");box.innerHTML=files.map((f,i)=>`<div class="file-chip"><span>📄</span><span>${esc(f.name)}</span><small>${fmtBytes(f.size)}</small></div>`).join("");
  actions.classList.remove("hidden");
  actions.innerHTML=`<button class="btn" data-home-tool="merge">Merge</button><button class="btn btn-ghost" data-home-tool="compress">Compress</button><button class="btn btn-ghost" data-home-tool="edit">Edit</button><button class="btn btn-ghost" data-home-tool="split">More tools</button>`;
  $$(".quick-actions button").forEach(b=>b.onclick=()=>openTool(b.dataset.homeTool,files));
}
function bindHomeDrop(){
  const drop=$("#homeDrop"),input=$("#homeInput");
  const accept=fs=>{state.files=fs.filter(f=>/pdf/i.test(f.type)||/\.pdf$/i.test(f.name));renderHomeFiles(state.files);if(state.files.length)setStatus("")};
  input.onchange=()=>accept([...input.files]);
  ["dragenter","dragover"].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.add("drag")}));
  ["dragleave","drop"].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.remove("drag")}));
  drop.addEventListener("drop",e=>accept([...e.dataTransfer.files]));
}
function restartTimer(){
  clearInterval(state.timerId);state.timerSeconds=1800;updateTimer();
  state.timerId=setInterval(()=>{state.timerSeconds--;updateTimer();if(state.timerSeconds<=0){clearInterval(state.timerId);clearObjectUrls();state.files=[];$("#toolMount").innerHTML='<div class="tool-panel"><strong>Workspace cleared.</strong><p class="hint">For privacy, the 30-minute local workspace has expired. Choose a tool again to start a new session.</p></div>';setStatus("Local working files cleared.","success")}},1000);
}
function updateTimer(){const m=Math.max(0,Math.floor(state.timerSeconds/60)),s=Math.max(0,state.timerSeconds%60);$("#timer").textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function clearObjectUrls(){state.objectUrls.forEach(URL.revokeObjectURL);state.objectUrls=[]}

document.addEventListener("DOMContentLoaded",()=>{
  if(!window.PDFLib)console.warn("pdf-lib not available yet.");
  renderTools();bindHomeDrop();
  $("#toolSearch").oninput=e=>renderTools(e.target.value);
  $("#toolGrid").addEventListener("click",e=>{const card=e.target.closest("[data-tool]");if(card)openTool(card.dataset.tool)});
  $("#backBtn").onclick=goHome;$$("[data-home]").forEach(a=>a.onclick=e=>{e.preventDefault();goHome()});
  $("#donateTop").href=DONATION_URL;$("#donateBottom").href=DONATION_URL;
  window.addEventListener("popstate",()=>{
    const m=location.hash.match(/^#tool=([^&]+)/);
    if(m){
      const id=decodeURIComponent(m[1]);
      if(toolMeta(id))openTool(id,[],{pushHistory:false});
    }else{goHome({replaceHistory:false});}
  });
});
})();
