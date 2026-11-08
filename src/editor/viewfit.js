// SPDX-License-Identifier: MIT OR Apache-2.0
// Fit an arbitrarily large 2D rig inside the CSS pixel viewport without altering artwork.
export function fitZoom(viewWidth,viewHeight,boundsWidth,boundsHeight,padding=0.8) {
 const width=Math.max(1,Number(viewWidth)||1);
 const height=Math.max(1,Number(viewHeight)||1);
 const objectWidth=Math.max(1,Number(boundsWidth)||1);
 const objectHeight=Math.max(1,Number(boundsHeight)||1);
 return Math.min(20,Math.max(0.0001,Math.min(width/objectWidth,height/objectHeight)*padding));
}
