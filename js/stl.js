// Экспорт STL. Бинарный, компактный.
export function vStl(geom, imya) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const p = g.attributes.position.array;
  const n = p.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const zag = new TextEncoder().encode(('ClipGen ' + (imya || '')).slice(0, 79));
  new Uint8Array(buf, 0, 80).set(zag);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i+3]-p[i], uy = p[i+4]-p[i+1], uz = p[i+5]-p[i+2];
    const vx = p[i+6]-p[i], vy = p[i+7]-p[i+1], vz = p[i+8]-p[i+2];
    let nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    const m = Math.hypot(nx,ny,nz) || 1; nx/=m; ny/=m; nz/=m;
    dv.setFloat32(o, nx, true); dv.setFloat32(o+4, ny, true); dv.setFloat32(o+8, nz, true); o += 12;
    for (let j = 0; j < 9; j++) { dv.setFloat32(o, p[i+j], true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Blob([buf], { type: 'model/stl' });
}

export function skachat(blob, imya) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = imya;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
