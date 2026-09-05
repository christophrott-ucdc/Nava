/** The tablet and TV share the original transparent EXODUS7 artwork. */
export function createExodusBrand(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const logo = document.createElementNS(ns, 'svg');
  logo.setAttribute('class', 'exodus-brand');
  logo.setAttribute('viewBox', '55 60 2070 562');
  logo.setAttribute('role', 'img');
  logo.setAttribute('aria-label', 'EXODUS7 · A Patra Lume');
  const artwork = document.createElementNS(ns, 'image');
  artwork.setAttribute('href', 'shared/brand/exodus7-v1.png');
  artwork.setAttribute('width', '2172');
  artwork.setAttribute('height', '724');
  logo.append(artwork);
  return logo;
}
