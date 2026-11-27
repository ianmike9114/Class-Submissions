// Live preview for learner HTML/CSS/JS. The page runs in an iframe with
// sandbox="allow-scripts allow-modals" and NO allow-same-origin: it gets an
// opaque origin, so learner JS cannot read this site's cookies, storage or
// Firebase session, and cannot touch parent.document. console.log and errors
// come back via postMessage and are shown in a small console panel under the frame.

export const CONSOLE_BRIDGE = `<script>(function(){
function send(kind,args){try{parent.postMessage({__lmsPreview:1,kind:kind,text:Array.prototype.map.call(args,function(a){try{return typeof a==="object"?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(" ")},"*")}catch(e){}}
["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o&&o.apply(console,arguments)}});
window.addEventListener("error",function(e){send("error",[e.message+(e.lineno?" (line "+e.lineno+")":"")])});
})();<\/script>`;

export function buildPreviewDoc(source) {
  const src = String(source || "");
  const headOpen = src.match(/<head[^>]*>/i);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return src.slice(0, at) + CONSOLE_BRIDGE + src.slice(at);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${CONSOLE_BRIDGE}</head><body>${src}</body></html>`;
}

export function mountPreview(container, source) {
  container.innerHTML = "";
  container.classList.remove("hidden");
  const frame = document.createElement("iframe");
  frame.className = "web-preview";
  frame.setAttribute("sandbox", "allow-scripts allow-modals");
  frame.setAttribute("title", "Preview of your web page");
  const log = document.createElement("ol");
  log.className = "web-console hidden";
  const onMsg = (e) => {
    if (e.source !== frame.contentWindow || !e.data || e.data.__lmsPreview !== 1) return;
    const li = document.createElement("li");
    li.className = `web-console-${e.data.kind}`;
    li.textContent = String(e.data.text).slice(0, 500);
    log.appendChild(li);
    log.classList.remove("hidden");
  };
  window.addEventListener("message", onMsg);
  // Drop the listener when this preview is replaced or removed.
  new MutationObserver((_, obs) => {
    if (!frame.isConnected) { window.removeEventListener("message", onMsg); obs.disconnect(); }
  }).observe(container, { childList: true });
  container.append(frame, log);
  frame.srcdoc = buildPreviewDoc(source);
}
