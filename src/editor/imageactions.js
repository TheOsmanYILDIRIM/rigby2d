// SPDX-License-Identifier: MIT OR Apache-2.0
// Remove an imported PNG and all references to its raster in the rig's skins.
export function imageUsage(doc, name) {
  return doc.slots.reduce((n, s) => n + (s.attachments || []).filter(a=>a.image===name).length, 0)
    + doc.skins.reduce((n,k)=>n+(k.slots||[]).reduce((m,e)=>m+(e.attachments||[]).filter(a=>a.image===name).length,0),0);
}
export function removeImportedImage(app,name,{confirm=true}={}) {
  const doc=app.doc;
  if(!doc.images.some(i=>i.name===name)) return false;
  if(app.mode!=='setup') { app.setStatus('Switch to SETUP before removing images'); return false; }
  const count=imageUsage(doc,name);
  if(confirm && !globalThis.confirm(`Remove PNG "${name}" and ${count} attachment reference(s)? This change can be undone before saving.`)) return false;
  // Removing from skins first avoids dangling alternate-skin attachments.
  for(const skin of doc.skins) for(const entry of skin.slots||[])
    entry.attachments = (entry.attachments||[]).filter(a=>a.image!==name);
  for(let s=doc.slots.length-1;s>=0;s--){
    const slot=doc.slots[s];
    slot.attachments = slot.attachments.filter(a=>a.image!==name);
    if(slot.attachment && !slot.attachments.some(a=>a.name===slot.attachment)
      && !doc.skins.some(k=>k.slots.some(e=>e.slot===s && e.attachments.some(a=>a.name===slot.attachment))))
      slot.attachment=slot.attachments[0]?.name??null;
    // Keep empty slots: they may have animation keys or constraints.
  }
  doc.images=doc.images.filter(i=>i.name!==name);
  app.images.map.delete(name);
  app.meshEdit=null;
  app.deselect();
  app.changed();
  app.setStatus(`Removed image "${name}" and ${count} attachment reference(s); empty slots preserved`);
  return true;
}
