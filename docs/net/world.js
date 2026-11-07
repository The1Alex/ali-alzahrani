// The 3D network: every node, link and particle formation is built from the CV data.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const UP = new V3(0, 1, 0);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrapPi = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const angDamp = (a, b, k, dt) => a + wrapPi(b - a) * (1 - Math.exp(-k * dt));
const eio = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randDir = r => {
  const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u);
  return new V3(s * Math.cos(th), u, s * Math.sin(th));
};
const bez = (A, C, B, t, out = new V3()) => {
  const u = 1 - t;
  return out.set(
    u * u * A.x + 2 * u * t * C.x + t * t * B.x,
    u * u * A.y + 2 * u * t * C.y + t * t * B.y,
    u * u * A.z + 2 * u * t * C.z + t * t * B.z
  );
};
const col = h => new THREE.Color(h);
const PAL = {
  ivory: col('#f5eddc'),
  brass: col('#d7b16b'),
  brassHi: col('#f6dca6'),
  steel: col('#8fb0dd'),
  steelDim: col('#3b5b8c'),
};

/* ───────────────────────── shaders ───────────────────────── */

const SOFT_FS = /* glsl */ `
varying vec3 vCol; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a *= a;
  if (a * vAlpha < 0.002) discard;
  gl_FragColor = vec4(vCol, a * vAlpha);
}`;

const DUST_VS = /* glsl */ `
attribute vec4 aRnd;
uniform float uTime, uScale, uIntro, uSize, uPointer;
uniform vec3 uRayO, uRayD, uColA, uColB;
varying vec3 vCol; varying float vAlpha;
void main(){
  vec3 p = position;
  float t = uTime * 0.06;
  p += vec3(sin(t*1.3 + aRnd.x*6.2831), sin(t*1.7 + aRnd.y*6.2831), cos(t*1.1 + aRnd.z*6.2831)) * (0.5 + aRnd.w);
  p *= mix(2.4, 1.0, uIntro);
  vec3 toP = p - uRayO;
  float along = max(dot(toP, uRayD), 0.0);
  vec3 away = p - (uRayO + uRayD * along);
  float d = length(away);
  float R = 1.1 + along * 0.06;
  float f = (1.0 - smoothstep(0.0, R, d)) * uPointer;
  p += away / max(d, 0.001) * f * R * 0.85;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float z = max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  float ps = uSize * (0.35 + aRnd.w * 1.1) * uScale / z;
  float tw = 0.6 + 0.4 * sin(uTime * (0.7 + aRnd.y * 1.6) + aRnd.x * 50.0);
  vAlpha = 0.6 * tw * (1.0 - smoothstep(25.0, 130.0, z)) * smoothstep(0.6, 5.0, z) * uIntro * (1.0 + f * 2.5);
  vAlpha *= clamp(ps / 1.5, 0.0, 1.0);
  gl_PointSize = max(ps, 1.5);
  vCol = mix(uColA, uColB, step(0.88, aRnd.z));
}`;

// Nucleus: dense spinning cores for "Ali" and the six hubs, with particle orbit rings.
const NUC_VS = /* glsl */ `
attribute vec4 aRnd; attribute float aKind;
uniform float uTime, uScale, uIntro, uSize, uHover, uActive, uDim, uSeed;
uniform vec3 uColA, uColB;
varying vec3 vCol; varying float vAlpha;
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
void main(){
  vec3 p = position;
  float r = length(p);
  if (aKind > 0.5) {
    float dir = mod(aKind, 2.0) > 0.5 ? 1.0 : -1.0;
    float ang = aRnd.x * 6.2831 + uTime * (0.22 + 0.18 * aRnd.y) * dir;
    vec3 q = vec3(cos(ang), 0.0, sin(ang)) * position.x;
    q.y += (aRnd.z - 0.5) * 0.05 * position.x;
    q.yz = rot2(position.y) * q.yz;
    q.xy = rot2(position.z) * q.xy;
    p = q;
    r = position.x;
  } else {
    float spin = uTime * (0.22 + 0.4 * aRnd.x) / (0.3 + r * 1.4);
    p.xz = rot2(spin + uSeed) * p.xz;
  }
  float e = 1.0 + 0.2 * uHover + 0.42 * uActive * (0.35 + aRnd.y);
  p *= e * (1.0 + 0.035 * sin(uTime * 1.3 + r * 5.0 + uSeed));
  float ii = clamp(uIntro * 1.35 - aRnd.z * 0.35, 0.0, 1.0);
  ii = 1.0 - pow(1.0 - ii, 3.0);
  vec3 scatter = normalize(aRnd.xyz - 0.5 + 0.001) * (9.0 + aRnd.w * 18.0);
  p = mix(scatter, p, ii);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float z = max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  float ps = uSize * (0.4 + 1.1 * aRnd.w * aRnd.w) * (1.0 + 0.35 * uHover) * uScale / z;
  vCol = mix(uColA, uColB, smoothstep(0.6, 0.92, aRnd.x));
  vAlpha = (0.45 + 0.55 * aRnd.y) * mix(1.0, 0.2, uDim) * (1.0 + 0.7 * uHover + 0.45 * uActive) * (0.25 + 0.75 * ii);
  vAlpha *= clamp(ps / 1.5, 0.0, 1.0);
  gl_PointSize = max(ps, 1.5);
}`;

const ENV_VS = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;
const ENV_FS = /* glsl */ `
uniform vec3 uCol; uniform float uAlpha, uTime, uHover, uIntro;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 3.2);
  float lat = smoothstep(0.94, 1.0, abs(sin(vP.y * 22.0 - uTime * 0.7))) * 0.3 * f;
  float a = (rim * 0.85 + lat) * uAlpha * (0.55 + 0.9 * uHover) * uIntro;
  gl_FragColor = vec4(uCol, a);
}`;

const LINEFX_VS = /* glsl */ `
attribute float aT; varying float vT;
void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LINEFX_FS = /* glsl */ `
uniform vec3 uCol; uniform float uAlpha, uIntro;
varying float vT;
void main(){
  float d = smoothstep(vT, vT + 0.08, uIntro * 1.2 - 0.12);
  gl_FragColor = vec4(uCol, uAlpha * d);
}`;

const RIBBON_VS = /* glsl */ `
attribute float aT; attribute float aS; varying float vT; varying float vS;
void main(){ vT = aT; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIBBON_FS = /* glsl */ `
uniform vec3 uCol; uniform float uAlpha, uHover, uActive, uTime, uIntro;
varying float vT; varying float vS;
void main(){
  float edge = smoothstep(0.32, 0.5, abs(vS - 0.5));
  float sweep = smoothstep(0.0, 0.04, vT) * (1.0 - smoothstep(0.96, 1.0, vT));
  float shimmer = pow(max(0.0, 1.0 - abs(fract(vT - uTime * 0.12) - 0.5) * 2.0), 10.0);
  float draw = smoothstep(vT, vT + 0.1, uIntro * 1.25 - 0.2);
  float a = (0.22 + 0.55 * edge + shimmer * 0.5) * (0.55 + 0.6 * uHover + 0.6 * uActive) * sweep;
  gl_FragColor = vec4(uCol, a * uAlpha * draw);
}`;

const LINK_VS = /* glsl */ `
attribute float aT; attribute float aId;
uniform sampler2D uState; uniform float uStateW;
varying float vT; varying vec4 vS;
void main(){
  vS = texture2D(uState, vec2((aId + 0.5) / uStateW, 0.5));
  vT = aT;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
const LINK_FS = /* glsl */ `
uniform vec3 uColA, uColB; uniform float uTime, uIntro;
varying float vT; varying vec4 vS;
void main(){
  float I = vS.r, V = vS.g;
  if (V < 0.003) discard;
  float t = vS.b > 0.5 ? 1.0 - vT : vT;
  float draw = smoothstep(vT, vT + 0.06, uIntro * 1.3 - 0.18);
  float glint = pow(max(0.0, 1.0 - abs(fract(t * 1.4 - uTime * (0.1 + 0.32 * I)) - 0.5) * 2.0), 16.0);
  float ends = smoothstep(0.0, 0.06, vT) * (1.0 - smoothstep(0.94, 1.0, vT));
  float a = (0.08 + 0.5 * I) * mix(0.5, 1.0, ends) + glint * (0.08 + 0.85 * I);
  vec3 c = mix(uColA, uColB, clamp(I * 1.25, 0.0, 1.0));
  gl_FragColor = vec4(c, a * V * draw);
}`;

const SIG_VS = /* glsl */ `
attribute vec3 aA; attribute vec3 aB; attribute vec3 aC; attribute float aId; attribute vec3 aP;
uniform sampler2D uState; uniform float uStateW, uTime, uScale, uIntro;
uniform vec3 uColA, uColB;
varying vec3 vCol; varying float vAlpha;
void main(){
  vec4 S = texture2D(uState, vec2((aId + 0.5) / uStateW, 0.5));
  float I = S.r, V = S.g;
  float sp = aP.y * (0.5 + 2.6 * I);
  float t = fract(aP.x + uTime * sp * 0.07);
  if (S.b > 0.5) t = 1.0 - t;
  float u = 1.0 - t;
  vec3 p = u * u * aA + 2.0 * u * t * aC + t * t * aB;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float z = max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  float ps = aP.z * (0.9 + 1.3 * I) * uScale / z;
  vAlpha = (0.12 + 0.95 * I) * V * smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t)) * smoothstep(0.7, 1.0, uIntro);
  vAlpha *= clamp(ps / 1.5, 0.0, 1.0);
  gl_PointSize = max(ps, 1.5);
  vCol = mix(uColA, uColB, I);
}`;

// Project and personal-build glyphs: core, ring (dashed for concepts), halo and a rotating bracket on focus.
const NODE_VS = /* glsl */ `
attribute float aId; attribute float aSize; attribute float aKind;
uniform sampler2D uState; uniform float uStateW, uTime, uScale, uIntro;
varying float vKind; varying vec4 vS; varying float vPx;
void main(){
  vS = texture2D(uState, vec2((aId + 0.5) / uStateW, 0.5));
  vKind = aKind;
  vec3 p = position + vec3(0.0, sin(uTime * 0.5 + aId * 1.7) * 0.06, 0.0);
  float ii = clamp(uIntro * 1.5 - 0.3 - fract(aId * 0.618) * 0.3, 0.0, 1.0);
  ii = 1.0 - pow(1.0 - ii, 3.0);
  p = mix(p * 0.15, p, ii);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float z = max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  float s = aSize * (1.0 + 0.55 * vS.r + 0.75 * vS.g) * (0.2 + 0.8 * ii);
  vPx = min(s * uScale / z, uScale * 0.042);
  gl_PointSize = max(vPx, 3.0);
}`;
const NODE_FS = /* glsl */ `
uniform vec3 uIvory, uBrass, uSteel; uniform float uTime;
varying float vKind; varying vec4 vS; varying float vPx;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  float hover = vS.r, sel = vS.g, dim = vS.b, vis = vS.a;
  float aa = 2.5 / max(vPx, 3.0);
  float core = 1.0 - smoothstep(0.16 - aa, 0.16 + aa, d);
  float ring = 1.0 - smoothstep(0.0, 0.05 + aa, abs(d - 0.6));
  float ang = atan(c.y, c.x);
  float dashed = step(4.5, vKind);
  ring *= mix(1.0, step(0.45, fract(ang / 6.2831 * 14.0 + uTime * 0.04)), dashed);
  float focus = max(hover, sel);
  float bracket = (1.0 - smoothstep(0.0, 0.035 + aa, abs(d - 0.9))) * step(0.62, fract(ang / 6.2831 * 4.0 - uTime * 0.08)) * focus;
  float halo = exp(-d * d * 7.0) * 0.4;
  float flagship = 1.0 - step(0.5, vKind);
  vec3 cc = mix(uIvory, uBrass, clamp(flagship * 0.5 + focus, 0.0, 1.0));
  vec3 rc = mix(uSteel, uBrass, clamp(flagship + focus, 0.0, 1.0));
  vec3 colr = cc * (core + halo) + rc * (ring * (0.55 + 0.45 * hover) + bracket);
  float a = clamp(core + halo + ring + bracket, 0.0, 1.0);
  a *= mix(1.0, 0.16, dim) * vis;
  gl_FragColor = vec4(colr, a);
}`;

// Skills: one star per skill, glyph by how the skill was used.
const SKILL_VS = /* glsl */ `
attribute float aId; attribute float aLevel;
uniform sampler2D uState; uniform float uStateW, uTime, uScale, uIntro, uSize, uVis;
varying float vLevel; varying vec4 vS; varying float vPx; varying float vTw;
void main(){
  vS = texture2D(uState, vec2((aId + 0.5) / uStateW, 0.5));
  vLevel = aLevel;
  vec3 p = position * mix(1.6, 1.0, uIntro);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float z = max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  float lv = aLevel < 0.5 ? 1.35 : aLevel < 1.5 ? 1.05 : aLevel < 3.5 ? 0.85 : aLevel > 5.5 ? 0.6 : 0.9;
  vPx = uSize * lv * (1.0 + 0.9 * vS.r) * (0.45 + 0.55 * uVis) * uScale / z;
  vTw = 0.75 + 0.25 * sin(uTime * (0.8 + fract(aId * 0.37) * 1.5) + aId);
  gl_PointSize = max(vPx, 3.0);
}`;
const SKILL_FS = /* glsl */ `
uniform vec3 uIvory, uBrass, uSteel; uniform float uTime, uVis, uIntro;
varying float vLevel; varying vec4 vS; varying float vPx; varying float vTw;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  float aa = 2.5 / max(vPx, 3.0);
  float core = 1.0 - smoothstep(0.22 - aa, 0.22 + aa, d);
  float ring = 1.0 - smoothstep(0.0, 0.06 + aa, abs(d - 0.62));
  float diamond = 1.0 - smoothstep(0.0, 0.07 + aa, abs(abs(c.x) + abs(c.y) - 0.62));
  float ang = atan(c.y, c.x);
  float dash = step(0.5, fract(ang / 6.2831 * 10.0));
  float halo = exp(-d * d * 6.0) * 0.35;
  vec3 colr; float a;
  if (vLevel < 0.5) { colr = uBrass; a = core + ring + halo; }
  else if (vLevel < 1.5) { colr = uIvory; a = core + halo * 0.8; }
  else if (vLevel < 2.5) { colr = uSteel; a = ring + core * 0.35 + halo * 0.5; }
  else if (vLevel < 3.5) { colr = uSteel; a = core * 0.7 + halo * 0.4; }
  else if (vLevel < 4.5) { colr = uSteel; a = diamond + halo * 0.4; }
  else if (vLevel < 5.5) { colr = uIvory; a = ring * dash + core * 0.5 + halo * 0.4; }
  else { colr = uSteel; a = core * 0.45 + halo * 0.25; }
  float hi = vS.r;
  colr = mix(colr, uBrass, hi * 0.6);
  a = clamp(a, 0.0, 1.0) * vTw * (1.0 + hi * 0.8) * mix(1.0, 0.12, vS.g) * uVis * vS.a * uIntro;
  gl_FragColor = vec4(colr, a);
}`;

const MARK_VS = /* glsl */ `
attribute float aId; attribute float aKind;
uniform sampler2D uState; uniform float uStateW, uTime, uScale, uIntro, uVis;
varying float vKind; varying vec4 vS; varying float vPx;
void main(){
  vS = texture2D(uState, vec2((aId + 0.5) / uStateW, 0.5));
  vKind = aKind;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float z = max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  float s = aKind > 3.5 ? 0.34 : aKind > 2.5 ? 0.13 : 0.2;
  if (aKind > 3.5) s *= 1.0 + 0.25 * sin(uTime * 2.4);
  vPx = s * (1.0 + 0.8 * vS.r) * uScale / z;
  gl_PointSize = max(vPx, 3.0);
}`;
const MARK_FS = /* glsl */ `
uniform vec3 uIvory, uBrass, uSteel; uniform float uIntro, uVis;
varying float vKind; varying vec4 vS; varying float vPx;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float aa = 2.5 / max(vPx, 3.0);
  float a; vec3 colr;
  if (vKind < 0.5) { colr = uIvory; a = 1.0 - smoothstep(0.32 - aa, 0.32 + aa, d); }
  else if (vKind < 1.5) { colr = uBrass; a = (1.0 - smoothstep(0.0, 0.09 + aa, abs(d - 0.55))) + (1.0 - smoothstep(0.18 - aa, 0.18 + aa, d)); }
  else if (vKind < 2.5) { colr = uBrass; float dm = abs(c.x) + abs(c.y); a = 1.0 - smoothstep(0.55 - aa, 0.55 + aa, dm); }
  else if (vKind < 3.5) { colr = uSteel; a = 1.0 - smoothstep(0.3 - aa, 0.3 + aa, d); }
  else { colr = uBrass; a = (1.0 - smoothstep(0.2 - aa, 0.2 + aa, d)) + (1.0 - smoothstep(0.0, 0.06 + aa, abs(d - 0.7))) * 0.8; }
  a += exp(-d * d * 6.0) * 0.25;
  if (d > 1.0) discard;
  gl_FragColor = vec4(colr, clamp(a, 0.0, 1.0) * uVis * uIntro * (0.7 + 0.6 * vS.r));
}`;

const FACT_COMMON = /* glsl */ `
attribute vec3 aFrom; attribute vec3 aTo; attribute vec4 aRnd; attribute vec2 aSeq;
uniform float uMorph, uSpread, uArc, uChaosA, uChaosB, uTime, uLight, uLitMode, uScaleF;
uniform vec3 uOrigin; uniform mat3 uBasis;
float eio(float t){ return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
vec3 factPos(out float e){
  float lp = clamp(uMorph * (1.0 + uSpread) - aSeq.x * uSpread, 0.0, 1.0);
  e = eio(lp);
  vec3 p = mix(aFrom, aTo, e);
  p.y += sin(e * 3.14159) * uArc * (0.6 + 0.8 * aRnd.x);
  float ch = mix(uChaosA, uChaosB, e);
  p += vec3(sin(uTime * (1.3 + aRnd.y * 2.0) + aRnd.x * 40.0), sin(uTime * (1.7 + aRnd.z * 2.0) + aRnd.y * 40.0), sin(uTime * (1.1 + aRnd.x * 2.0) + aRnd.z * 40.0)) * ch * 0.13;
  return uOrigin + uBasis * (p * uScaleF);
}
float factLit(float e){
  float litSweep = smoothstep(aSeq.y - 0.004, aSeq.y + 0.004, uLight);
  float litArrive = smoothstep(0.82, 1.0, e) * step(aSeq.y, 1.5);
  return mix(litSweep, litArrive, uLitMode);
}`;
const FACT_VS = FACT_COMMON + /* glsl */ `
uniform float uScale, uSize, uVis;
uniform vec3 uDimCol, uLitCol;
varying vec3 vCol; varying float vAlpha;
void main(){
  float e; vec3 w = factPos(e);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float z = max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  float lit = factLit(e);
  vCol = mix(uDimCol, uLitCol, lit);
  float ps = uSize * (0.8 + 0.5 * aRnd.w) * (1.0 + 0.55 * lit) * uScale / z;
  vAlpha = uVis * (0.42 + 0.58 * lit);
  vAlpha *= clamp(ps / 1.5, 0.0, 1.0);
  gl_PointSize = max(ps, 1.5);
}`;
const FACT_LINE_VS = FACT_COMMON + /* glsl */ `
uniform float uLineVis;
uniform vec3 uDimCol, uLitCol;
varying vec3 vCol; varying float vAlpha;
void main(){
  float e; vec3 w = factPos(e);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  float lit = factLit(e);
  vCol = mix(uDimCol, uLitCol, lit * 0.8);
  vAlpha = uLineVis * (0.35 + 0.45 * lit);
}`;
const FACT_LINE_FS = /* glsl */ `
varying vec3 vCol; varying float vAlpha;
void main(){ gl_FragColor = vec4(vCol, vAlpha); }`;

const COMET_VS = /* glsl */ `
attribute float aK;
uniform float uScale, uVis;
uniform vec3 uColA, uColB;
varying vec3 vCol; varying float vAlpha;
void main(){
  vec4 mv = viewMatrix * vec4(position, 1.0);
  float z = max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  float ps = (0.42 * (1.0 - aK) + 0.05) * uScale / z;
  vAlpha = uVis * pow(1.0 - aK, 1.6);
  vCol = mix(uColB, uColA, aK);
  gl_PointSize = max(ps, 1.5);
}`;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.032 },
    uVignette: { value: 0.6 },
    uCA: { value: 0.0022 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uGrain, uVignette, uCA;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uCA * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      float vig = 1.0 - smoothstep(0.2, 1.05, length(c * vec2(1.0, 0.92)) * 1.25);
      col *= mix(1.0 - uVignette, 1.0, vig);
      float g = rnd(vUv * uRes + fract(uTime * 7.13) * 91.7) - 0.5;
      col += g * uGrain * (0.35 + 0.65 * (1.0 - vig));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

class StateTex {
  constructor(w) {
    this.w = w;
    this.data = new Float32Array(w * 4);
    this.tex = new THREE.DataTexture(this.data, w, 1, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
  }
}

/* ───────────────────── data-true formations ─────────────────────
   Each formation draws a real number from the CV with exactly that many particles. */

function sunflower(n, rad, i) {
  const r = rad * Math.sqrt((i + 0.5) / n), a = i * 2.39996323;
  return [Math.cos(a) * r, Math.sin(a) * r];
}
function ballPoint(r, rad) {
  const d = randDir(r), k = rad * Math.cbrt(r());
  return [d.x * k, d.y * k, d.z * k];
}

const FORMATIONS = {
  // ~300 employees trained on Copilot: a disc of 300 people that light up from the centre outwards.
  ai(r) {
    const n = 300, A = [], B = [], d1 = [], d2 = [], ord = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = sunflower(n, 1.5, i), z = (r() - 0.5) * 0.08;
      A.push(x, y, z); B.push(x * 1.05, y * 1.05, z + 0.06);
      d1.push(Math.sqrt(i / n)); d2.push(0); ord.push(i / n);
    }
    return { n, A, B, d1, d2, ord, lines: [], s1: { dur: 1.5, spread: 0.6, arc: 0.3 }, s2: { dur: 1.0, spread: 0, arc: 0, lit: 'sweep', light: 2.8 }, size: 0.062 };
  },
  // ~100 people across seven departments moved from the office to remote work.
  people(r) {
    const n = 100, A = [], B = [], d1 = [], d2 = [], ord = [], lines = [];
    const sizes = [15, 15, 14, 14, 14, 14, 14];
    let i = 0;
    sizes.forEach((sz, g) => {
      const th0 = g * (TAU / 7) + 0.25;
      for (let k = 0; k < sz; k++, i++) {
        const gx = (i % 5) - 2, gy = Math.floor(i / 5) % 5 - 2, gz = Math.floor(i / 25) - 1.5;
        A.push(gx * 0.17, gy * 0.17, gz * 0.17);
        const th = th0 + (r() - 0.5) * 0.6, R = 1.45 + r() * 0.35;
        B.push(Math.cos(th) * R, Math.sin(th) * R * 0.78, (r() - 0.5) * 0.5);
        d1.push(r()); d2.push(g / 7 + r() * 0.08); ord.push(0);
        lines.push([i, -1]);
      }
    });
    return { n, A, B, d1, d2, ord, lines, linesFrom: 2, s1: { dur: 1.3, spread: 0.5, arc: 0.2 }, s2: { dur: 2.6, spread: 0.7, arc: 0.45, lit: 'arrive' }, size: 0.07 };
  },
  // 1,000+ devices brought back under control: chaos snaps into a registered lattice.
  security(r) {
    const n = 1000, slots = [], chaos = [];
    for (let i = 0; i < n; i++) {
      const x = i % 10, y = Math.floor(i / 100), z = Math.floor(i / 10) % 10;
      slots.push([(x - 4.5) * 0.165, (y - 4.5) * 0.165, (z - 4.5) * 0.165, y]);
      chaos.push(ballPoint(r, 1.65));
    }
    slots.sort((a, b) => a[1] - b[1]);
    chaos.sort((a, b) => a[1] - b[1]);
    const A = [], B = [], d1 = [], d2 = [], ord = [];
    for (let i = 0; i < n; i++) {
      A.push(...chaos[i]); B.push(slots[i][0], slots[i][1], slots[i][2]);
      d1.push(r()); d2.push(i / n * 0.85 + r() * 0.15); ord.push(0);
    }
    return { n, A, B, d1, d2, ord, lines: [], s1: { dur: 1.4, spread: 0.6, arc: 0, chaos: [0.2, 1.0] }, s2: { dur: 3.0, spread: 0.85, arc: 0.0, chaos: [1.0, 0.0], lit: 'arrive' }, size: 0.045 };
  },
  // 699 users moved to Exchange Online with zero downtime: every particle arrives.
  enterprise(r) {
    const n = 699, A = [], B = [], d1 = [], d2 = [], ord = [];
    const blobs = [[1.15, 0.25, 0, 0.5], [1.65, 0.55, 0.1, 0.52], [2.1, 0.22, -0.08, 0.42], [1.55, -0.05, 0.18, 0.44]];
    for (let i = 0; i < n; i++) {
      const cx = i % 7, cy = Math.floor(i / 7) % 10, cz = Math.floor(i / 70);
      A.push(-1.95 + cx * 0.12, (cy - 4.5) * 0.12, (cz - 4.5) * 0.11);
      const b = blobs[Math.floor(r() * blobs.length)], d = randDir(r), k = b[3] * (0.82 + 0.18 * Math.cbrt(r()));
      B.push(b[0] + d.x * k - 0.7, b[1] + d.y * k * 0.8, b[2] + d.z * k * 0.7);
      d1.push(cx / 7 * 0.5 + r() * 0.5); d2.push(cx / 7 * 0.9 + r() * 0.1); ord.push(0);
    }
    return { n, A, B, d1, d2, ord, lines: [], s1: { dur: 1.4, spread: 0.6, arc: 0.2 }, s2: { dur: 3.2, spread: 0.85, arc: 0.75, lit: 'arrive' }, size: 0.05 };
  },
  // 100+ Cisco and N-Tron switches re-architected: a tangle becomes a clean topology.
  industrial(r) {
    const n = 100, A = [], B = [], d1 = [], d2 = [], ord = [], lines = [];
    B.push(0, 1.1, 0); A.push(...ballPoint(r, 1.4)); d1.push(0); d2.push(0); ord.push(0);
    for (let k = 0; k < 4; k++) {
      B.push(-1.2 + k * 0.8, 0.38, 0); A.push(...ballPoint(r, 1.4)); d1.push(r()); d2.push(0.05); ord.push(0.05 + k * 0.02);
      lines.push([0, 1 + k]);
    }
    const per = [24, 24, 24, 23];
    let i = 5;
    per.forEach((cnt, k) => {
      const dx = -1.2 + k * 0.8;
      for (let j = 0; j < cnt; j++, i++) {
        const row = j % 2, idx = Math.floor(j / 2), m = Math.ceil(cnt / 2);
        B.push(dx + (idx / (m - 1) - 0.5) * 0.7, -0.4 - row * 0.32, (r() - 0.5) * 0.3);
        A.push(...ballPoint(r, 1.45));
        d1.push(r()); d2.push(0.15 + k * 0.15 + r() * 0.2); ord.push(0.15 + (i - 5) / 95 * 0.85);
        lines.push([1 + k, i]);
      }
    });
    return { n, A, B, d1, d2, ord, lines, linesFrom: 1, s1: { dur: 1.4, spread: 0.6, arc: 0, chaos: [0.3, 0.9] }, s2: { dur: 2.4, spread: 0.7, arc: 0.0, chaos: [0.9, 0.0], lit: 'sweep', light: 1.8, lightDelay: 1.6 }, size: 0.07 };
  },
  // Nine remote sites, 500+ users, 79% of issues resolved remotely at first line.
  outcomes(r) {
    const sites = 9, per = 56, n = sites * per, A = [], B = [], d1 = [], d2 = [], ord = [], lines = [];
    const elig = new Array(n).fill(false);
    const idx = [...Array(n).keys()].sort(() => r() - 0.5);
    for (let k = 0; k < Math.round(n * 0.79); k++) elig[idx[k]] = true;
    for (let s = 0; s < sites; s++) {
      const a = Math.PI / 2 + s * (TAU / sites), cx = Math.cos(a) * 1.45, cy = Math.sin(a) * 1.45;
      for (let j = 0; j < per; j++) {
        const i = s * per + j;
        const d = randDir(r), k = 0.24 * Math.sqrt((j + 0.5) / per);
        const p = [cx + d.x * k, cy + d.y * k, d.z * k];
        A.push(...p); B.push(...p);
        d1.push(s / sites * 0.7 + r() * 0.3); d2.push(0);
        ord.push(elig[i] ? r() : 2.0);
      }
      lines.push([s * per, -1]);
    }
    return { n, A, B, d1, d2, ord, lines, linesFrom: 1, s1: { dur: 1.6, spread: 0.7, arc: 0.25 }, s2: { dur: 0.6, spread: 0, arc: 0, lit: 'sweep', light: 2.4 }, size: 0.055 };
  },
};

/* ───────────────────────── the world ───────────────────────── */

export class World {
  constructor(canvas, DATA, opts = {}) {
    this.D = DATA;
    this.canvas = canvas;
    this.tier = opts.tier || 'high';
    this.reduced = !!opts.reduced;
    this.mobile = !!opts.mobile;
    this.W = Math.max(1, window.innerWidth);
    this.H = Math.max(1, window.innerHeight);
    const cap = this.tier === 'high' ? 2 : this.tier === 'mid' ? 1.5 : 1.3;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap);
    this.t = 0;
    this.intro = 0; this.introOn = false; this.introT = 0;
    this.introDur = this.reduced ? 0.2 : 3.4;
    this.ptr = { x: -9999, y: -9999, on: false, s: 0 };
    this.focus = { chapter: 'hero', hub: null, hover: null, selected: null, trace: null, skills: null, roleHover: null };
    this.registry = [];
    this.byId = new Map();
    this.nbr = new Map();
    this.stats = { nodes: 0, links: 0, particles: 0 };
    this.v = new V3();
    this.v2 = new V3();
    this.ndc = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this._initRenderer();
    this._layout();
    this._buildBackground();
    this._buildDust();
    this._buildCore();
    this._buildHubs();
    this._buildTimeline();
    this._buildLinks();
    this._buildNodes();
    this._buildSkills();
    this._buildFacts();
    this._buildComet();
    this._initPost();
    this._initCamera();
    this.stats.nodes = this.registry.filter(e => ['core', 'hub', 'proj', 'pers', 'role'].includes(e.type)).length;
    this.resize();
  }

  /* ── setup ── */

  _initRenderer() {
    const R = (this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance',
    }));
    R.setPixelRatio(this.dpr);
    R.setSize(this.W, this.H, false);
    R.setClearColor(0x010409, 1);
    R.toneMapping = THREE.ACESFilmicToneMapping;
    R.toneMappingExposure = 0.96;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.mobile ? 46 : 38, this.W / this.H, 0.1, 600);
    this.U = { uTime: { value: 0 }, uScale: { value: 1 }, uIntro: { value: 0 } };
  }

  _initPost() {
    const samples = this.tier === 'low' ? 0 : 4;
    const rt = new THREE.WebGLRenderTarget(this.W * this.dpr, this.H * this.dpr, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this._composerDpr = this.dpr;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.W, this.H), 0.78, 0.55, 0.1);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  _initCamera() {
    this.rig = { target: new V3(0, 1, 0), dist: 70, yaw: 0.2, pitch: 0.3, shiftX: 0.2, shiftY: 0 };
    this.goal = { target: new V3(0, 1, 0), dist: 27, yaw: 0.42, pitch: 0.16, shiftX: 0.2, shiftY: 0, auto: 1 };
    this.drag = { yaw: 0, pitch: 0, vy: 0, vp: 0, active: false, release: 0 };
    this.par = { x: 0, y: 0 };
    this.orbit = 0;
    this._updateCamera(0);
  }

  _reg(id, type, pos, r, extra = {}) {
    const e = { id, type, pos, r, sx: -9999, sy: -9999, depth: 1, front: false, occ: false, pr: 10, ...extra };
    this.registry.push(e);
    this.byId.set(id, e);
    return e;
  }

  get(id) { return this.byId.get(id); }

  /* ── layout ── */

  _layout() {
    const D = this.D;
    const ang = { ai: -36, people: 36, security: 108, enterprise: 180, industrial: 252 };
    const hy = { ai: -0.45, people: -1.15, security: -0.25, enterprise: -0.95, industrial: -0.6 };
    this.hubIds = D.map.hubs.map(h => h.id);
    this.hubPos = {};
    const extra = this.hubIds.filter(id => id !== 'outcomes' && !(id in ang));
    extra.forEach((id, i) => { ang[id] = 300 + i * 20; hy[id] = -0.5; });
    for (const id of this.hubIds) {
      if (id === 'outcomes') this.hubPos[id] = new V3(0, 5.4, 0.25);
      else {
        const a = (ang[id] * Math.PI) / 180;
        this.hubPos[id] = new V3(Math.sin(a) * 6.3, hy[id], Math.cos(a) * 6.3);
      }
    }
    this._reg('core', 'core', new V3(0, 0, 0), 1.0);
    for (const h of D.map.hubs) this._reg('hub:' + h.id, 'hub', this.hubPos[h.id], h.id === 'outcomes' ? 1.05 : 0.9, { hub: h.id, name: h.name });

    // Projects sit between the hubs they drew on.
    const groups = {};
    for (const p of D.projects.projects) {
      const pil = p.pillars.filter(h => this.hubPos[h]);
      const key = [...pil].sort().join('|');
      (groups[key] = groups[key] || []).push(p);
    }
    for (const key of Object.keys(groups)) {
      const list = groups[key], pillars = key.split('|');
      const cen = new V3();
      pillars.forEach(h => cen.add(this.hubPos[h]));
      cen.multiplyScalar(1 / pillars.length);
      let base;
      if (pillars.length === 1) {
        const H = this.hubPos[pillars[0]];
        const out = new V3(H.x, 0, H.z).normalize();
        base = H.clone().addScaledVector(out, 1.9).add(new V3(0, -1.55, 0));
      } else {
        const dir = cen.clone().normalize();
        base = dir.multiplyScalar(cen.length() + 1.0 + 0.3 * pillars.length);
      }
      const nrm = base.clone().normalize();
      const t1 = new V3().crossVectors(UP, nrm);
      if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0);
      t1.normalize();
      const t2 = new V3().crossVectors(nrm, t1).normalize();
      const n = list.length;
      list.forEach((p, i) => {
        const pos = base.clone();
        if (n > 1) {
          const a = i * 2.39996 + 0.7, rad = 0.95 * Math.sqrt((i + 0.6) / n) * (n > 2 ? 1.2 : 1);
          pos.addScaledVector(t1, Math.cos(a) * rad).addScaledVector(t2, Math.sin(a) * rad).addScaledVector(nrm, i % 2 ? -0.3 : 0.3);
        }
        const kind = p.tier === 'flagship' ? 0 : p.tier === 'case' ? 1 : 2;
        this._reg('proj:' + p.slug, 'proj', pos, 0.5, { slug: p.slug, pillars: p.pillars, role: p.role_id, tier: p.tier, kind });
      });
    }

    // Personal builds orbit the AI hub, below it.
    {
      const H = this.hubPos.ai || new V3(-3, 0, 5);
      const out = new V3(H.x, 0, H.z).normalize();
      const right = new V3(out.z, 0, -out.x);
      const list = D.projects.personal;
      list.forEach((p, i) => {
        const a = -1.15 + (i / Math.max(1, list.length - 1)) * 2.3;
        const pos = H.clone().addScaledVector(out, 1.25 + Math.cos(a) * 0.9).addScaledVector(right, Math.sin(a) * 2.35).add(new V3(0, -2.05 - Math.cos(a) * 0.45, 0));
        const st = (p.stage || '').toLowerCase();
        const kind = st === 'live' || st === 'test release' ? 3 : st === 'prototype' ? 4 : 5;
        this._reg('pers:' + p.slug, 'pers', pos, 0.45, { slug: p.slug, pillars: ['ai'], kind });
      });
    }

    // Skills: a star shell grouped by category.
    {
      const r = mulberry(21);
      const cats = D.skills.categories;
      const RS = 14.5;
      this.skillList = [];
      cats.forEach((c, ci) => {
        const y = 1 - (2 * (ci + 0.5)) / cats.length;
        const rr = Math.sqrt(1 - y * y), th = ci * 2.39996 + 0.5;
        const cen = new V3(Math.cos(th) * rr, y * 0.78, Math.sin(th) * rr).normalize();
        const t1 = new V3().crossVectors(UP, cen).normalize();
        const t2 = new V3().crossVectors(cen, t1).normalize();
        const n = c.skills.length;
        const spread = 0.1 + 0.032 * Math.sqrt(n);
        this._reg('cat:' + c.id, 'cat', cen.clone().multiplyScalar(RS * 1.13), 0, { cat: c.id, name: c.name, count: n });
        c.skills.forEach((s, j) => {
          const rad = spread * Math.sqrt((j + 0.5) / n), a = j * 2.39996;
          const dir = cen.clone().addScaledVector(t1, Math.cos(a) * rad).addScaledVector(t2, Math.sin(a) * rad).normalize();
          const pos = dir.multiplyScalar(RS * (1 + (r() - 0.5) * 0.06));
          const idx = this.skillList.length;
          const proofs = String(s[2] || '').split(',').map(x => x.trim()).filter(Boolean);
          this.skillList.push({ idx, name: s[0], level: s[1], cat: c.id, proofs, pos });
          this._reg('skill:' + idx, 'skill', pos, 0.28, { skill: idx, cat: c.id });
        });
      });
    }
  }

  /* ── builders ── */

  _pointsMat(vs, fs, uniforms) {
    return new THREE.ShaderMaterial({
      uniforms, vertexShader: vs, fragmentShader: fs,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }

  _buildBackground() {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.U.uTime,
        uAspect: { value: 1 },
        uFocus: { value: new THREE.Vector2(0.66, 0.52) },
        uA: { value: col('#041026') },
        uB: { value: col('#010206') },
        uGlow: { value: col('#0c2a55') },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAspect; uniform vec2 uFocus; uniform vec3 uA, uB, uGlow; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
        void main(){
          vec2 q = (vUv - uFocus) * vec2(uAspect, 1.0);
          float g = exp(-dot(q, q) * 1.25);
          vec3 c = mix(uB, uA, smoothstep(-0.3, 1.2, vUv.y) * 0.75 + g * 0.45);
          float n = fbm(vUv * vec2(uAspect, 1.0) * 2.0 + vec2(uTime * 0.007, -uTime * 0.004));
          c += uGlow * g * (0.1 + 0.2 * n);
          c += uGlow * 0.035 * (n - 0.5);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    q.frustumCulled = false;
    q.renderOrder = -1000;
    this.scene.add(q);
    this.bg = m;
  }

  _buildDust() {
    const N = this.tier === 'high' ? 7000 : this.tier === 'mid' ? 5000 : 2800;
    const r = mulberry(11);
    const pos = new Float32Array(N * 3), rnd = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const d = randDir(r), near = r() < 0.14, rad = near ? 8 + r() * 10 : 19 + Math.pow(r(), 0.8) * 72;
      pos[i * 3] = d.x * rad; pos[i * 3 + 1] = d.y * rad * 0.62; pos[i * 3 + 2] = d.z * rad;
      rnd[i * 4] = r(); rnd[i * 4 + 1] = r(); rnd[i * 4 + 2] = r(); rnd[i * 4 + 3] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    this.dustU = {
      uTime: this.U.uTime, uScale: this.U.uScale, uIntro: this.U.uIntro,
      uSize: { value: 0.05 }, uPointer: { value: 0 },
      uRayO: { value: new V3() }, uRayD: { value: new V3(0, 0, -1) },
      uColA: { value: PAL.steel.clone().multiplyScalar(0.62) }, uColB: { value: PAL.brass.clone().multiplyScalar(0.9) },
    };
    const p = new THREE.Points(g, this._pointsMat(DUST_VS, SOFT_FS, this.dustU));
    p.frustumCulled = false;
    this.scene.add(p);
    this.stats.particles += N;
  }

  _nucleus(R, nBody, rings, seed, colA, colB, size) {
    const r = mulberry(seed);
    const nRing = rings.reduce((a, x) => a + x[3], 0);
    const N = nBody + nRing;
    const pos = new Float32Array(N * 3), rnd = new Float32Array(N * 4), kind = new Float32Array(N);
    for (let i = 0; i < nBody; i++) {
      const d = randDir(r), u = r();
      const rad = u < 0.55 ? R * Math.pow(r(), 2.1) * 0.92 : R * (0.84 + 0.16 * r());
      pos[i * 3] = d.x * rad; pos[i * 3 + 1] = d.y * rad; pos[i * 3 + 2] = d.z * rad;
      rnd.set([r(), r(), r(), r()], i * 4);
    }
    let i = nBody;
    rings.forEach((rg, k) => {
      for (let j = 0; j < rg[3]; j++, i++) {
        pos[i * 3] = rg[0]; pos[i * 3 + 1] = rg[1]; pos[i * 3 + 2] = rg[2];
        rnd.set([r(), r(), r(), r()], i * 4);
        kind[i] = k + 1;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    const U = {
      uTime: this.U.uTime, uScale: this.U.uScale, uIntro: this.U.uIntro,
      uSize: { value: size }, uHover: { value: 0 }, uActive: { value: 0 }, uDim: { value: 0 }, uSeed: { value: seed * 0.37 },
      uColA: { value: colA }, uColB: { value: colB },
    };
    const pts = new THREE.Points(g, this._pointsMat(NUC_VS, SOFT_FS, U));
    pts.frustumCulled = false;
    this.stats.particles += N;
    const envU = { uCol: { value: colB.clone().lerp(PAL.steel, 0.35) }, uAlpha: { value: 0.55 }, uTime: this.U.uTime, uHover: { value: 0 }, uIntro: this.U.uIntro };
    const env = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.32, 48, 32),
      new THREE.ShaderMaterial({ uniforms: envU, vertexShader: ENV_VS, fragmentShader: ENV_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    env.frustumCulled = false;
    const grp = new THREE.Group();
    grp.add(pts, env);
    return { grp, U, envU };
  }

  _buildCore() {
    const low = this.tier === 'low';
    const rings = [[1.5, 0.35, 0.2, low ? 110 : 200], [1.78, -0.55, 0.9, low ? 110 : 200], [2.02, 1.1, -0.4, low ? 110 : 200]];
    const c = this._nucleus(0.95, low ? 1800 : 3000, rings, 3, PAL.ivory.clone(), PAL.brass.clone(), 0.045);
    c.envU.uAlpha.value = 0.3;
    this.scene.add(c.grp);
    this.core = c;
  }

  _buildHubs() {
    const low = this.tier === 'low';
    this.hubs = {};
    this.hubIds.forEach((id, k) => {
      const big = id === 'outcomes';
      const R = big ? 0.68 : 0.55;
      const rings = [[R * 1.75, 0.5 + k * 0.4, 0.3 - k * 0.2, low ? 70 : 120], [R * 2.15, -0.7 + k * 0.3, 1.0 - k * 0.15, low ? 70 : 120]];
      const colB = big ? PAL.brassHi.clone() : PAL.brass.clone();
      const h = this._nucleus(R, low ? 700 : 1150, rings, 40 + k * 7, PAL.ivory.clone(), colB, 0.042);
      h.grp.position.copy(this.hubPos[id]);
      this.scene.add(h.grp);
      this.hubs[id] = h;
    });
  }

  _lines(pos, t, color, alpha) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
    const U = { uCol: { value: color.clone() }, uAlpha: { value: alpha }, uIntro: this.U.uIntro };
    const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: LINEFX_VS, fragmentShader: LINEFX_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const l = new THREE.LineSegments(g, m);
    l.frustumCulled = false;
    return { obj: l, U, base: alpha };
  }

  _ribbon(r1, r2, p1, p2, seg, color, alpha) {
    const pos = [], t = [], s = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const f = i / seg, ph = p1 + (p2 - p1) * f;
      pos.push(Math.sin(ph) * r1, 0, Math.cos(ph) * r1, Math.sin(ph) * r2, 0, Math.cos(ph) * r2);
      t.push(f, f); s.push(0, 1);
      if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1));
    g.setIndex(idx);
    const U = { uCol: { value: color.clone() }, uAlpha: { value: alpha }, uHover: { value: 0 }, uActive: { value: 0 }, uTime: this.U.uTime, uIntro: this.U.uIntro };
    const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    return { obj: mesh, U, base: alpha };
  }

  // The armillary: a 21-year timeline ring around the core with roles, employers, scholarships and learning.
  _buildTimeline() {
    const D = this.D;
    const G = (this.timeline = new THREE.Group());
    G.rotation.set(0.12, 0, 0);
    this.scene.add(G);
    const R = 2.72, Y0 = 2006, Y1 = 2027, MID = 2020.4, SWEEP = TAU * 0.86;
    const K = SWEEP / (Y1 - Y0);
    const phi = y => (y - MID) * K;
    const P = (ph, rad, y = 0) => new V3(Math.sin(ph) * rad, y, Math.cos(ph) * rad);
    this.tl = { R, phi, P, parts: [] };
    const add = part => { G.add(part.obj); this.tl.parts.push(part); return part; };

    {
      const pos = [], t = [], n = 420;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const f = i / n, p = P(phi(Y0) + SWEEP * f, R);
        if (prev) { pos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z); t.push((i - 1) / n, f); }
        prev = p;
      }
      add(this._lines(pos, t, PAL.brass, 0.6));
    }
    {
      const pos = [], t = [];
      const months = (Y1 - Y0) * 12;
      for (let m = 0; m <= months; m++) {
        const y = Y0 + m / 12, isYear = m % 12 === 0, year = Y0 + Math.floor(m / 12);
        const len = isYear && year % 5 === 0 ? 0.24 : isYear ? 0.14 : 0.05;
        const a = P(phi(y), R), b = P(phi(y), R + len);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        const f = (y - Y0) / (Y1 - Y0);
        t.push(f, f);
      }
      add(this._lines(pos, t, PAL.brass, 0.42));
    }

    // Roles and employers.
    this.roleParts = {};
    const NOW = 2026.85;
    G.updateMatrixWorld(true);
    const toW = v => v.clone().applyMatrix4(G.matrixWorld);
    for (const emp of D.career.employers) {
      let s = Infinity, e = -Infinity;
      for (const role of emp.roles) {
        s = Math.min(s, role.start); e = Math.max(e, Math.min(role.end, NOW));
        const p1 = phi(role.start + 0.03), p2 = phi(Math.min(role.end, NOW) - 0.03);
        const rb = add(this._ribbon(2.4, 2.56, p1, p2, 64, PAL.brass, 0.85));
        this.roleParts[role.id] = rb;
        const mid = (p1 + p2) / 2;
        this._reg('role:' + role.id, 'role', toW(P(mid, 2.48)), 0.38, { roleId: role.id, labelPos: toW(P(mid, 2.05, -0.02)) });
      }
      const b = add(this._ribbon(2.9, 2.95, phi(s + 0.02), phi(e - 0.02), 80, PAL.steel, 0.9));
      b.band = true;
      const mid = (phi(s) + phi(e)) / 2;
      this._reg('band:' + emp.name, 'band', toW(P(mid, 3.2)), 0, { name: emp.name });
    }
    {
      const sch = add(this._ribbon(2.9, 2.95, phi(2007.0), phi(2013.0), 60, PAL.ivory, 0.55));
      sch.band = true;
      this._reg('band:Saudi Aramco scholarship', 'band', toW(P(phi(2010), 3.2)), 0, { name: 'Saudi Aramco scholarship' });
    }

    // Learning, awards and qualifications parsed from the credentials data.
    const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const when = s => {
      if (!s) return null;
      const t = s.toLowerCase();
      const m = t.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/);
      if (m) return +m[2] + (MONTHS.indexOf(m[1]) + 0.5) / 12;
      const rg = t.match(/(\d{4})\s+to\s+(\d{4})/);
      if (rg) return +rg[1] + 0.5;
      const y = t.match(/\b(19|20)\d{2}\b/);
      return y ? +y[0] + 0.5 : null;
    };
    const C = D.credentials;
    const ev = [];
    for (const e of C.education) { const y = when(e.detail); if (y) ev.push({ kind: 0, y, title: e.title, org: e.org, detail: e.detail, status: e.status }); }
    for (const q of C.qualifications) {
      let y = when(q.detail);
      if (q.kind === 'progress') y = NOW + 0.05;
      if (y) ev.push({ kind: 1, y, title: q.title, org: q.org, detail: q.detail, status: q.status });
    }
    for (const a of C.awards) { const y = when(a.detail); if (y) ev.push({ kind: 2, y, title: a.title, org: a.org, detail: a.detail }); }
    for (const g of C.groups) for (const it of g.items) { const y = when(it.detail); if (y) ev.push({ kind: 3, y, title: it.title, org: it.org, detail: it.detail, group: g.name }); }
    ev.push({ kind: 4, y: NOW, title: 'Now', org: 'Middle East IT Leader, Vallourec', detail: 'November 2026' });
    const events = ev.filter(e => e.y >= Y0 && e.y <= Y1).sort((a, b) => a.y - b.y);
    const stacks = [];
    const pos = [], aId = [], aKind = [];
    this.events = events;
    events.forEach((e, i) => {
      let k = 0;
      while (stacks.some(s => s.k === k && Math.abs(s.y - e.y) < 0.32)) k++;
      stacks.push({ y: e.y, k });
      const p = P(phi(e.y), R - 0.02 - k * 0.17, 0.02 + k * 0.01);
      pos.push(p.x, p.y, p.z); aId.push(i); aKind.push(e.kind);
      this._reg('evt:' + i, 'evt', toW(p), 0.2, { ev: e, idx: i });
    });
    this.markState = new StateTex(64);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mg.setAttribute('aId', new THREE.Float32BufferAttribute(aId, 1));
    mg.setAttribute('aKind', new THREE.Float32BufferAttribute(aKind, 1));
    this.markU = {
      uState: { value: this.markState.tex }, uStateW: { value: 64 }, uTime: this.U.uTime, uScale: this.U.uScale, uIntro: this.U.uIntro, uVis: { value: 1 },
      uIvory: { value: PAL.ivory }, uBrass: { value: PAL.brassHi }, uSteel: { value: PAL.steel },
    };
    const marks = new THREE.Points(mg, new THREE.ShaderMaterial({ uniforms: this.markU, vertexShader: MARK_VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    marks.frustumCulled = false;
    G.add(marks);

    for (const y of [2006, 2010, 2014, 2018, 2022, 2026]) this._reg('year:' + y, 'year', toW(P(phi(y), R + 0.5)), 0, { year: y });

    // Gimbal rings: the instrument around the core.
    const ring = (rad, ticks, color, alpha) => {
      const pos = [], t = [], n = 256;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU, p = new V3(Math.cos(a) * rad, Math.sin(a) * rad, 0);
        if (prev) { pos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z); t.push((i - 1) / n, i / n); }
        prev = p;
      }
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * TAU, l = i % 6 === 0 ? 0.16 : 0.07;
        pos.push(Math.cos(a) * rad, Math.sin(a) * rad, 0, Math.cos(a) * (rad + l), Math.sin(a) * (rad + l), 0);
        t.push(i / ticks, i / ticks);
      }
      return this._lines(pos, t, color, alpha);
    };
    this.gimA = new THREE.Group();
    this.gimB = new THREE.Group();
    const ga = ring(3.3, 72, PAL.steel, 0.22), gb = ring(3.55, 48, PAL.brass, 0.18);
    this.gimA.add(ga.obj);
    this.gimB.add(gb.obj);
    this.gimB.rotation.x = 1.12;
    this.gimParts = [ga, gb];
    this.scene.add(this.gimA, this.gimB);
  }

  _buildLinks() {
    const D = this.D;
    const links = (this.links = []);
    const add = (type, a, b, A, B, C, extra = {}) => {
      const L = { i: links.length, type, a, b, A: A.clone(), B: B.clone(), C: C.clone(), ...extra };
      links.push(L);
      for (const [x, y] of [[a, b], [b, a]]) {
        if (!this.nbr.has(x)) this.nbr.set(x, new Set());
        this.nbr.get(x).add(y);
      }
      return L;
    };
    const mid = (A, B) => A.clone().add(B).multiplyScalar(0.5);
    for (const id of this.hubIds) {
      const H = this.hubPos[id];
      const A = H.clone().normalize().multiplyScalar(1.05);
      add('spoke', 'core', 'hub:' + id, A, H, mid(A, H).add(new V3(0, 0.55, 0)));
    }
    D.map.links.forEach(([a, b, label]) => {
      const A = this.hubPos[a], B = this.hubPos[b];
      if (!A || !B) return;
      const C = mid(A, B).multiplyScalar(1.24).add(new V3(0, 0.45, 0));
      const L = add('hub', 'hub:' + a, 'hub:' + b, A, B, C, { label, ha: a, hb: b });
      this._reg('cap:' + L.i, 'cap', bez(A, C, B, 0.5), 0, { link: L.i, label, ha: a, hb: b });
    });
    for (const e of this.registry.filter(x => x.type === 'proj' || x.type === 'pers')) {
      for (const h of e.pillars) {
        const H = this.hubPos[h];
        if (!H) continue;
        add('fil', e.id, 'hub:' + h, e.pos, H, mid(e.pos, H).multiplyScalar(1.08).add(new V3(0, 0.22, 0)), { hub: h });
      }
    }
    for (const e of this.registry.filter(x => x.type === 'proj' && x.role)) {
      const role = this.get('role:' + e.role);
      if (!role) continue;
      add('role', role.id, e.id, role.pos, e.pos, mid(role.pos, e.pos).add(new V3(0, 1.3, 0)));
    }
    for (const s of this.skillList) {
      for (const slug of s.proofs) {
        const node = this.get('proj:' + slug) || this.get('pers:' + slug);
        if (!node) continue;
        add('skill', 'skill:' + s.idx, node.id, s.pos, node.pos, mid(s.pos, node.pos).multiplyScalar(0.8), { skill: s.idx, cat: s.cat });
      }
    }
    this.stats.links = links.filter(l => l.type !== 'skill' && l.type !== 'role').length;
    this.stats.proofLinks = links.filter(l => l.type === 'skill').length;

    const SAMPLES = { spoke: 34, hub: 52, fil: 26, role: 30, skill: 40 };
    const SIG = { spoke: 10, hub: 14, fil: 3, role: 3, skill: 2 };
    const W = (this.linkW = links.length > 256 ? 512 : 256);
    this.linkState = new StateTex(W);
    this.linkCur = new Float32Array(links.length * 3);
    const pos = [], aT = [], aId = [];
    const sA = [], sB = [], sC = [], sId = [], sP = [];
    const r = mulberry(5);
    const tmp = new V3(), prev = new V3();
    for (const L of links) {
      const n = SAMPLES[L.type];
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        bez(L.A, L.C, L.B, t, tmp);
        if (k > 0) {
          pos.push(prev.x, prev.y, prev.z, tmp.x, tmp.y, tmp.z);
          aT.push((k - 1) / (n - 1), t);
          aId.push(L.i, L.i);
        }
        prev.copy(tmp);
      }
      for (let k = 0; k < SIG[L.type]; k++) {
        sA.push(L.A.x, L.A.y, L.A.z); sB.push(L.B.x, L.B.y, L.B.z); sC.push(L.C.x, L.C.y, L.C.z);
        sId.push(L.i);
        sP.push(r(), 0.6 + r() * 0.8, L.type === 'hub' || L.type === 'spoke' ? 0.07 : 0.05);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
    g.setAttribute('aId', new THREE.Float32BufferAttribute(aId, 1));
    this.linkU = {
      uState: { value: this.linkState.tex }, uStateW: { value: W }, uTime: this.U.uTime, uIntro: this.U.uIntro,
      uColA: { value: PAL.steel.clone() }, uColB: { value: PAL.brassHi.clone() },
    };
    const lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: this.linkU, vertexShader: LINK_VS, fragmentShader: LINK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lines.frustumCulled = false;
    this.scene.add(lines);

    const sg = new THREE.BufferGeometry();
    const nS = sId.length;
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(nS * 3), 3));
    sg.setAttribute('aA', new THREE.Float32BufferAttribute(sA, 3));
    sg.setAttribute('aB', new THREE.Float32BufferAttribute(sB, 3));
    sg.setAttribute('aC', new THREE.Float32BufferAttribute(sC, 3));
    sg.setAttribute('aId', new THREE.Float32BufferAttribute(sId, 1));
    sg.setAttribute('aP', new THREE.Float32BufferAttribute(sP, 3));
    this.sigU = {
      uState: { value: this.linkState.tex }, uStateW: { value: W }, uTime: this.U.uTime, uScale: this.U.uScale, uIntro: this.U.uIntro,
      uColA: { value: PAL.steel.clone() }, uColB: { value: PAL.brassHi.clone() },
    };
    const sig = new THREE.Points(sg, this._pointsMat(SIG_VS, SOFT_FS, this.sigU));
    sig.frustumCulled = false;
    this.scene.add(sig);
    this.stats.particles += nS;
  }

  _buildNodes() {
    const nodes = (this.nodeList = this.registry.filter(e => e.type === 'proj' || e.type === 'pers'));
    this.nodeState = new StateTex(64);
    this.nodeCur = new Float32Array(64 * 4);
    const pos = [], aId = [], aSize = [], aKind = [];
    nodes.forEach((e, i) => {
      e.ni = i;
      pos.push(e.pos.x, e.pos.y, e.pos.z);
      aId.push(i);
      aSize.push(e.kind === 0 ? 0.62 : e.kind === 1 ? 0.48 : e.kind === 2 ? 0.38 : 0.5);
      aKind.push(e.kind);
      this.nodeCur[i * 4 + 3] = 1;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aId', new THREE.Float32BufferAttribute(aId, 1));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(aSize, 1));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(aKind, 1));
    this.nodeU = {
      uState: { value: this.nodeState.tex }, uStateW: { value: 64 }, uTime: this.U.uTime, uScale: this.U.uScale, uIntro: this.U.uIntro,
      uIvory: { value: PAL.ivory }, uBrass: { value: PAL.brassHi }, uSteel: { value: PAL.steel },
    };
    const pts = new THREE.Points(g, this._pointsMat(NODE_VS, NODE_FS, this.nodeU));
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  _buildSkills() {
    const LV = { lead: 0, hands: 1, coord: 2, support: 3, trained: 4, explored: 5, earlier: 6 };
    const n = this.skillList.length;
    const W = n > 256 ? 512 : 256;
    this.skillState = new StateTex(W);
    this.skillCur = new Float32Array(W * 4);
    const pos = [], aId = [], aLevel = [];
    this.skillList.forEach((s, i) => {
      pos.push(s.pos.x, s.pos.y, s.pos.z);
      aId.push(i);
      aLevel.push(LV[s.level] ?? 1);
      this.skillCur[i * 4 + 3] = 1;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aId', new THREE.Float32BufferAttribute(aId, 1));
    g.setAttribute('aLevel', new THREE.Float32BufferAttribute(aLevel, 1));
    this.skillU = {
      uState: { value: this.skillState.tex }, uStateW: { value: W }, uTime: this.U.uTime, uScale: this.U.uScale, uIntro: this.U.uIntro,
      uSize: { value: 0.25 }, uVis: { value: 0.2 },
      uIvory: { value: PAL.ivory }, uBrass: { value: PAL.brassHi }, uSteel: { value: PAL.steel },
    };
    const pts = new THREE.Points(g, this._pointsMat(SKILL_VS, SKILL_FS, this.skillU));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.stats.particles += n;
  }

  _buildFacts() {
    const N = 1000, NL = 256;
    const r = mulberry(99);
    const mk = (n) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aFrom', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aTo', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const rnd = new Float32Array(n * 4);
      for (let i = 0; i < n * 4; i++) rnd[i] = r();
      g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
      g.setAttribute('aSeq', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      g.setDrawRange(0, 0);
      return g;
    };
    this.factG = mk(N);
    this.factLG = mk(NL);
    this.factU = {
      uMorph: { value: 0 }, uSpread: { value: 0.6 }, uArc: { value: 0 }, uChaosA: { value: 0 }, uChaosB: { value: 0 },
      uTime: this.U.uTime, uLight: { value: 0 }, uLitMode: { value: 0 }, uScaleF: { value: 1 },
      uOrigin: { value: new V3() }, uBasis: { value: new THREE.Matrix3() },
      uScale: this.U.uScale, uSize: { value: 0.06 }, uVis: { value: 0 }, uLineVis: { value: 0 },
      uDimCol: { value: PAL.steel.clone().multiplyScalar(0.7) }, uLitCol: { value: PAL.brassHi.clone() },
    };
    const pts = new THREE.Points(this.factG, this._pointsMat(FACT_VS, SOFT_FS, this.factU));
    pts.frustumCulled = false;
    const lines = new THREE.LineSegments(this.factLG, new THREE.ShaderMaterial({ uniforms: this.factU, vertexShader: FACT_LINE_VS, fragmentShader: FACT_LINE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lines.frustumCulled = false;
    this.scene.add(pts, lines);
    this.fact = { hub: null, state: 'none', t: 0, queue: undefined, spec: null, anchor: null, stage: 0 };
    this._reg('fact', 'fact', new V3(), 0);
    this.stats.particles += N;
  }

  _buildComet() {
    const N = 48;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const k = new Float32Array(N);
    for (let i = 0; i < N; i++) k[i] = i / (N - 1);
    g.setAttribute('aK', new THREE.BufferAttribute(k, 1));
    this.cometU = { uScale: this.U.uScale, uVis: { value: 0 }, uColA: { value: PAL.steel.clone() }, uColB: { value: PAL.brassHi.clone().multiplyScalar(1.6) } };
    const pts = new THREE.Points(g, this._pointsMat(COMET_VS, SOFT_FS, this.cometU));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.comet = { g, N };
  }

  /* ── public API ── */

  startIntro(instant = false) {
    this.introOn = true;
    if (instant) { this.introT = this.introDur; this.intro = 1; }
  }

  setFocus(partial) { Object.assign(this.focus, partial); }

  setPointer(x, y, on) { this.ptr.x = x; this.ptr.y = y; this.ptr.on = on; this.ptr.nx = (x / this.W) * 2 - 1; this.ptr.ny = (y / this.H) * 2 - 1; }

  dragBy(dx, dy) {
    this.drag.active = true;
    this.drag.release = 0;
    const k = this.mobile ? 0.008 : 0.0055;
    this.drag.yaw -= dx * k;
    this.drag.pitch += dy * k * 0.7;
    this.drag.pitch = clamp(this.drag.pitch, -0.9, 0.9);
    this.drag.vy = -dx * k * 60;
    this.drag.vp = dy * k * 0.7 * 60;
  }
  dragEnd() { this.drag.active = false; }
  resetDrag() { this.drag.release = 1; }

  setCameraGoal(g) {
    this.goal.target.copy(g.target);
    this.goal.dist = g.dist; this.goal.yaw = g.yaw; this.goal.pitch = g.pitch;
    this.goal.shiftX = g.shiftX; this.goal.shiftY = g.shiftY; this.goal.auto = g.auto || 0;
  }

  chapterGoal(key) {
    const m = this.mobile;
    const g = { target: new V3(), dist: 20, yaw: 0, pitch: 0.2, shiftX: m ? 0 : 0.17, shiftY: m ? 0.2 : 0, auto: 0 };
    const hubCam = (id, dist) => {
      const H = this.hubPos[id];
      if (!H) return;
      if (id === 'outcomes') { g.yaw = 5.62; g.pitch = 0.38; } else { g.yaw = Math.atan2(H.x, H.z) + 0.4; g.pitch = 0.26; }
      const fa = this.factAnchor(id, g.yaw);
      g.target.copy(H).lerp(fa.center, m ? 0.45 : 0.5);
      g.dist = dist;
    };
    switch (key) {
      case 'hero': g.target.set(0, 1.5, 0); g.dist = m ? 44 : 36.5; g.yaw = 0.42; g.pitch = 0.22; g.auto = 1; g.shiftX = m ? 0 : 0.215; g.shiftY = m ? 0.19 : 0.015; break;
      case 'career': g.target.set(0, -0.2, 0); g.dist = m ? 17 : 13.6; g.yaw = 0.0; g.pitch = 0.58; break;
      case 'outcomes': hubCam('outcomes', m ? 17 : 13); break;
      case 'traces': g.target.set(0, 1.4, 0); g.dist = m ? 34 : 24.5; g.yaw = 6.05; g.pitch = 0.42; break;
      case 'skills': g.target.set(0, 0.4, 0); g.dist = m ? 62 : 48; g.yaw = 6.6; g.pitch = 0.2; g.auto = 0.5; break;
      case 'credentials': g.target.set(0, -0.25, 0); g.dist = m ? 17 : 13.8; g.yaw = -3.45; g.pitch = 0.62; break;
      case 'contact': g.target.set(0, 1.4, 0); g.dist = m ? 44 : 37; g.yaw = -1.0; g.pitch = 0.24; g.auto = 1; g.shiftX = m ? 0 : 0.175; break;
      default: if (this.hubPos[key]) hubCam(key, m ? 17.5 : 13.6);
    }
    return g;
  }

  factAnchor(id, yaw) {
    const H = this.hubPos[id];
    const right = new V3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new V3(Math.sin(yaw), 0, Math.cos(yaw));
    const center = this.mobile
      ? H.clone().add(new V3(0, 2.6, 0)).addScaledVector(fwd, 0.4)
      : H.clone().addScaledVector(right, 2.45).add(new V3(0, 0.45, 0)).addScaledVector(fwd, 0.1);
    const basis = new THREE.Matrix3().set(right.x, 0, fwd.x, right.y, 1, fwd.y, right.z, 0, fwd.z);
    return { center, basis, scale: this.mobile ? 0.62 : 0.74, right, fwd };
  }

  focusGoal(id, base) {
    const e = this.get(id);
    const g = { ...base, target: base.target.clone() };
    if (!e) return g;
    g.target.copy(e.pos);
    if (e.type === 'role' || e.type === 'evt') { g.target.copy(e.pos).multiplyScalar(0.55); g.dist = this.mobile ? 13 : 9.5; g.pitch = 0.6; }
    else g.dist = this.mobile ? 9 : 7.2;
    g.shiftX = this.mobile ? 0 : -0.17;
    g.shiftY = this.mobile ? 0.24 : 0;
    g.auto = 0;
    return g;
  }

  showFact(hubId) {
    const f = this.fact;
    const want = FORMATIONS[hubId] ? hubId : null;
    if (want === f.hub && f.state !== 'out') return;
    f.queue = want;
    if (f.state === 'none') { if (want) this._startFact(want); }
    else if (f.state !== 'out') this._collapseFact();
  }

  factInfo() {
    const f = this.fact, U = this.factU;
    if (!f.hub || f.state === 'none') return null;
    let p = 0;
    if (f.stage >= 2) {
      if (f.spec.s2.lit === 'sweep') p = U.uLight.value;
      else p = clamp((U.uMorph.value * (1 + U.uSpread.value) - 0.9) / Math.max(0.0001, U.uSpread.value));
    }
    return { hub: f.hub, stage: f.stage, state: f.state, p: f.state === 'out' ? 0 : clamp(p), vis: U.uVis.value, entry: this.get('fact') };
  }

  setTrace(path, u) { this.focus.trace = path ? { path, u } : null; }

  skillInfo(i) { return this.skillList[i]; }

  setDpr(d) {
    this.dpr = d;
    this.renderer.setPixelRatio(d);
    this.resize();
  }

  /* ── formations ── */

  _localOf(world, anchor) {
    const v = world.clone().sub(anchor.center).divideScalar(anchor.scale);
    const m = anchor.basis.clone().transpose();
    return v.applyMatrix3(m);
  }

  _uploadFact(from, to, delay, ord, lines, n, lineSrc) {
    const g = this.factG;
    g.attributes.aFrom.array.set(from.subarray ? from : Float32Array.from(from), 0);
    g.attributes.aTo.array.set(to.subarray ? to : Float32Array.from(to), 0);
    const seq = g.attributes.aSeq.array;
    for (let i = 0; i < n; i++) { seq[i * 2] = delay[i]; seq[i * 2 + 1] = ord[i]; }
    g.attributes.aFrom.needsUpdate = g.attributes.aTo.needsUpdate = g.attributes.aSeq.needsUpdate = true;
    g.setDrawRange(0, n);
    const lg = this.factLG;
    const LF = lg.attributes.aFrom.array, LT = lg.attributes.aTo.array, LS = lg.attributes.aSeq.array, LR = lg.attributes.aRnd.array, PR = g.attributes.aRnd.array;
    let v = 0;
    for (const [a, b] of lines) {
      for (const idx of [a, b]) {
        if (v >= 256) break;
        if (idx < 0) {
          LF[v * 3] = LF[v * 3 + 1] = LF[v * 3 + 2] = 0;
          LT[v * 3] = LT[v * 3 + 1] = LT[v * 3 + 2] = 0;
          LS[v * 2] = 0; LS[v * 2 + 1] = 3.0;
          LR[v * 4] = LR[v * 4 + 1] = LR[v * 4 + 2] = LR[v * 4 + 3] = 0;
        } else {
          for (let c = 0; c < 3; c++) { LF[v * 3 + c] = lineSrc.from[idx * 3 + c]; LT[v * 3 + c] = lineSrc.to[idx * 3 + c]; }
          LS[v * 2] = delay[idx]; LS[v * 2 + 1] = ord[idx];
          for (let c = 0; c < 4; c++) LR[v * 4 + c] = PR[idx * 4 + c];
        }
        v++;
      }
    }
    lg.attributes.aFrom.needsUpdate = lg.attributes.aTo.needsUpdate = lg.attributes.aSeq.needsUpdate = lg.attributes.aRnd.needsUpdate = true;
    lg.setDrawRange(0, v);
  }

  _startFact(hub) {
    const spec = FORMATIONS[hub](mulberry(hub.length * 977 + 13));
    const yaw = this.chapterGoal(hub).yaw;
    const anchor = this.factAnchor(hub, yaw);
    const f = this.fact;
    Object.assign(f, { hub, state: 's1', t: 0, spec, anchor, stage: 1, queue: undefined });
    const U = this.factU;
    U.uOrigin.value.copy(anchor.center);
    U.uBasis.value.copy(anchor.basis);
    U.uScaleF.value = anchor.scale;
    U.uSize.value = spec.size * 0.82;
    const hubLocal = this._localOf(this.hubPos[hub], anchor);
    const r = mulberry(7);
    const from = new Float32Array(spec.n * 3);
    for (let i = 0; i < spec.n; i++) {
      from[i * 3] = hubLocal.x + (r() - 0.5) * 0.4;
      from[i * 3 + 1] = hubLocal.y + (r() - 0.5) * 0.4;
      from[i * 3 + 2] = hubLocal.z + (r() - 0.5) * 0.4;
    }
    const A = Float32Array.from(spec.A);
    f.A = A; f.B = Float32Array.from(spec.B);
    this._uploadFact(from, A, spec.d1, spec.ord, spec.linesFrom === 1 ? spec.lines : [], spec.n, { from, to: A });
    U.uMorph.value = 0; U.uSpread.value = spec.s1.spread; U.uArc.value = spec.s1.arc;
    const ch = spec.s1.chaos || [0, 0];
    U.uChaosA.value = ch[0]; U.uChaosB.value = ch[1];
    U.uLight.value = 0; U.uLitMode.value = 0; U.uLineVis.value = 0;
    this.get('fact').pos.copy(anchor.center).addScaledVector(UP, (this.mobile ? 1.8 : 2.15) * anchor.scale);
  }

  _currentFactPositions() {
    const f = this.fact, U = this.factU, g = this.factG;
    const n = g.drawRange.count;
    const F = g.attributes.aFrom.array, T = g.attributes.aTo.array, S = g.attributes.aSeq.array;
    const out = new Float32Array(n * 3);
    const sp = U.uSpread.value, m = U.uMorph.value;
    for (let i = 0; i < n; i++) {
      const lp = clamp(m * (1 + sp) - S[i * 2] * sp), e = eio(lp);
      for (let c = 0; c < 3; c++) out[i * 3 + c] = F[i * 3 + c] + (T[i * 3 + c] - F[i * 3 + c]) * e;
    }
    return out;
  }

  _collapseFact() {
    const f = this.fact, U = this.factU;
    if (!f.hub) { f.state = 'none'; return; }
    const cur = this._currentFactPositions();
    const n = cur.length / 3;
    const hubLocal = this._localOf(this.hubPos[f.hub], f.anchor);
    const to = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { to[i * 3] = hubLocal.x; to[i * 3 + 1] = hubLocal.y; to[i * 3 + 2] = hubLocal.z; }
    const g = this.factG;
    g.attributes.aFrom.array.set(cur, 0);
    g.attributes.aTo.array.set(to, 0);
    const S = g.attributes.aSeq.array;
    for (let i = 0; i < n; i++) S[i * 2] = (i % 37) / 37;
    g.attributes.aFrom.needsUpdate = g.attributes.aTo.needsUpdate = g.attributes.aSeq.needsUpdate = true;
    U.uMorph.value = 0; U.uSpread.value = 0.35; U.uArc.value = 0; U.uChaosA.value = 0; U.uChaosB.value = 0;
    f.state = 'out'; f.t = 0; f.stage = 0;
  }

  _updateFact(dt) {
    const f = this.fact, U = this.factU;
    if (f.state === 'none') return;
    f.t += dt;
    const spec = f.spec;
    if (f.state === 's1') {
      U.uMorph.value = clamp(f.t / spec.s1.dur);
      U.uVis.value = damp(U.uVis.value, 1, 4, dt);
      if (spec.linesFrom === 1) U.uLineVis.value = damp(U.uLineVis.value, 0.45, 2, dt);
      if (f.t > spec.s1.dur + 0.45) {
        f.state = 's2'; f.t = 0; f.stage = 2;
        this._uploadFact(f.A, f.B, spec.d2, spec.ord, spec.lines, spec.n, { from: f.A, to: f.B });
        U.uMorph.value = 0; U.uSpread.value = spec.s2.spread; U.uArc.value = spec.s2.arc;
        const ch = spec.s2.chaos || [spec.s1.chaos ? spec.s1.chaos[1] : 0, 0];
        U.uChaosA.value = ch[0]; U.uChaosB.value = ch[1];
        U.uLitMode.value = spec.s2.lit === 'arrive' ? 1 : 0;
        U.uLight.value = 0;
      }
    } else if (f.state === 's2' || f.state === 'idle') {
      U.uMorph.value = clamp(f.t / spec.s2.dur);
      if (spec.s2.lit === 'sweep') {
        const d0 = spec.s2.lightDelay || 0.2;
        U.uLight.value = clamp((f.t - d0) / (spec.s2.light || 2));
      }
      const lineGoal = spec.lines.length ? (spec.linesFrom === 2 ? clamp((U.uMorph.value - 0.7) / 0.3) : 1) * 0.85 : 0;
      U.uLineVis.value = damp(U.uLineVis.value, lineGoal, 3, dt);
      if (f.t > spec.s2.dur + (spec.s2.light || 0) + 0.5) f.state = 'idle';
    } else if (f.state === 'out') {
      U.uMorph.value = clamp(f.t / 0.75);
      U.uVis.value = damp(U.uVis.value, 0, 5, dt);
      U.uLineVis.value = damp(U.uLineVis.value, 0, 8, dt);
      if (f.t > 0.8) {
        f.state = 'none'; f.hub = null;
        this.factG.setDrawRange(0, 0); this.factLG.setDrawRange(0, 0);
        U.uVis.value = 0;
        if (f.queue) this._startFact(f.queue);
      }
    }
  }

  /* ── traces ── */

  _tracePoint(path, u, out) {
    const n = path.length;
    if (n < 2) return out.copy(this.hubPos[path[0]] || new V3());
    const uu = clamp(u, 0, n - 1);
    const i = Math.min(n - 2, Math.floor(uu)), f = uu - i;
    const a = path[i], b = path[i + 1];
    const A = this.hubPos[a], B = this.hubPos[b];
    const L = this.links.find(l => l.type === 'hub' && ((l.ha === a && l.hb === b) || (l.ha === b && l.hb === a)));
    if (L) return L.ha === a ? bez(L.A, L.C, L.B, f, out) : bez(L.B, L.C, L.A, f, out);
    const C = A.clone().add(B).multiplyScalar(0.5);
    if (C.lengthSq() < 0.5) C.add(new V3(0, 2.2, 0));
    else C.multiplyScalar(1.3).add(new V3(0, 0.6, 0));
    return bez(A, C, B, f, out);
  }

  _updateComet(dt) {
    const tr = this.focus.trace;
    this.cometU.uVis.value = damp(this.cometU.uVis.value, tr ? 1 : 0, 4, dt);
    if (!tr) return;
    const arr = this.comet.g.attributes.position.array;
    const p = new V3();
    for (let i = 0; i < this.comet.N; i++) {
      this._tracePoint(tr.path, tr.u - i * 0.011, p);
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    }
    this.comet.g.attributes.position.needsUpdate = true;
  }

  /* ── per-frame state ── */

  _related(id) { return id ? this.nbr.get(id) || new Set() : new Set(); }

  _updateStates(dt) {
    const f = this.focus, ch = f.chapter, hub = f.hub;
    const hov = f.hover, sel = f.selected, tr = f.trace, sk = f.skills;
    const relH = this._related(hov), relS = this._related(sel);
    const k = 7;

    // Links
    const BI = { spoke: 0.2, hub: 0.17, fil: 0.07, role: 0.12, skill: 0.05 };
    const BV = { spoke: 1, hub: 1, fil: 0.8, role: 0, skill: 0 };
    const tSeg = new Map();
    if (tr) {
      const step = Math.floor(tr.u + 1e-4);
      for (let i = 0; i < tr.path.length - 1; i++) {
        const a = tr.path[i], b = tr.path[i + 1];
        const L = this.links.find(l => l.type === 'hub' && ((l.ha === a && l.hb === b) || (l.ha === b && l.hb === a)));
        if (L) tSeg.set(L.i, { cur: i === Math.min(step, tr.path.length - 2) && tr.u < tr.path.length - 1, done: i < step, rev: L.ha !== a });
      }
    }
    const sd = this.linkState.data, cur = this.linkCur;
    for (const L of this.links) {
      let I = BI[L.type], V = BV[L.type], R = 0;
      if (hub) {
        const touch = L.a === 'hub:' + hub || L.b === 'hub:' + hub;
        if (touch) { I = L.type === 'fil' ? 0.5 : 0.78; V = Math.max(V, 0.9); }
        else if (L.type !== 'skill' && L.type !== 'role') { I *= 0.5; V *= 0.7; }
        if (hub === 'outcomes' && L.a === 'hub:outcomes') R = 1;
      }
      if (ch === 'career' && L.type === 'role') { V = 0.3; I = 0.14; }
      if (ch === 'skills') {
        if (L.type === 'skill') { V = 0.14; I = 0.06; } else { I *= 0.5; V *= 0.55; }
      }
      if (ch === 'hero' || ch === 'contact') { if (L.type === 'hub') I = 0.26; }
      if (sk && L.type === 'skill') {
        if (sk.matches && sk.matches.has(L.skill)) { V = 0.95; I = 0.85; }
        else if (sk.cat && L.cat === sk.cat) { V = 0.6; I = 0.45; }
        else if (sk.matches || sk.cat) V = 0.03;
      }
      if (tr) {
        const s = tSeg.get(L.i);
        if (s) { I = s.cur ? 1 : s.done ? 0.62 : 0.3; V = 1; R = s.rev ? 1 : 0; }
        else if (L.type !== 'skill') { I *= 0.4; V *= 0.6; }
      }
      if (f.roleHover && L.type === 'role' && L.a === 'role:' + f.roleHover) { V = 1; I = 1; }
      if (hov && (L.a === hov || L.b === hov)) { V = 1; I = 1; }
      if (sel && (L.a === sel || L.b === sel)) { if (L.type === 'skill') { V = 0.6; I = 0.45; } else { V = 1; I = Math.max(I, 0.9); } }
      const j = L.i * 3;
      cur[j] = damp(cur[j], I, k, dt);
      cur[j + 1] = damp(cur[j + 1], V, k, dt);
      cur[j + 2] = R;
      sd[L.i * 4] = cur[j]; sd[L.i * 4 + 1] = cur[j + 1]; sd[L.i * 4 + 2] = cur[j + 2];
    }
    this.linkState.tex.needsUpdate = true;

    // Project and personal nodes
    const nd = this.nodeState.data, nc = this.nodeCur;
    const proofSet = sk && sk.proofs ? sk.proofs : null;
    for (const e of this.nodeList) {
      let h = 0, s = 0, d = 0, v = 1;
      if (hub) d = e.pillars.includes(hub) ? 0 : 0.86;
      if (ch === 'hero' || ch === 'contact') d = 0.42;
      if (ch === 'career' || ch === 'credentials') d = 0.86;
      if (ch === 'traces' || ch === 'skills') d = 0.62;
      if (f.roleHover) { if (e.role === f.roleHover) { d = 0; h = 0.55; } else d = Math.max(d, 0.6); }
      if (proofSet && proofSet.has(e.id)) { d = 0; h = 0.75; }
      if (hov) { if (hov === e.id) { h = 1; d = 0; } else if (relH.has(e.id)) { h = Math.max(h, 0.3); d = Math.min(d, 0.15); } }
      if (sel) { if (sel === e.id) { s = 1; d = 0; } else d = Math.max(d, relS.has(e.id) ? 0.25 : 0.82); }
      const j = e.ni * 4;
      nc[j] = damp(nc[j], h, 9, dt); nc[j + 1] = damp(nc[j + 1], s, 7, dt); nc[j + 2] = damp(nc[j + 2], d, 5, dt); nc[j + 3] = damp(nc[j + 3], v, 5, dt);
      nd[j] = nc[j]; nd[j + 1] = nc[j + 1]; nd[j + 2] = nc[j + 2]; nd[j + 3] = nc[j + 3];
    }
    this.nodeState.tex.needsUpdate = true;

    // Hubs and core
    const trHub = tr ? tr.path[Math.min(tr.path.length - 1, Math.round(tr.u))] : null;
    const selE = sel ? this.get(sel) : null;
    for (const id of this.hubIds) {
      const U = this.hubs[id].U, E = this.hubs[id].envU;
      const hid = 'hub:' + id;
      const hv = hov === hid ? 1 : 0;
      let act = hub === id || trHub === id ? 1 : 0;
      let dm = 0;
      if (hub && hub !== id) dm = 0.5;
      if (tr) dm = tr.path.includes(id) ? (trHub === id ? 0 : 0.15) : 0.6;
      if (ch === 'skills' || ch === 'career' || ch === 'credentials') dm = 0.45;
      if (selE && selE.pillars) { if (selE.pillars.includes(id)) { act = Math.max(act, 0.6); dm = 0; } else dm = 0.55; }
      if (hov && hov !== hid && hov.startsWith('proj:')) { const he = this.get(hov); if (he && he.pillars.includes(id)) { act = Math.max(act, 0.5); dm = 0; } }
      U.uHover.value = damp(U.uHover.value, hv, 8, dt);
      U.uActive.value = damp(U.uActive.value, act, 4, dt);
      U.uDim.value = damp(U.uDim.value, dm, 4, dt);
      E.uHover.value = U.uHover.value + U.uActive.value * 0.6;
    }
    {
      const U = this.core.U;
      const act = ch === 'career' || ch === 'credentials' ? 1 : 0;
      U.uHover.value = damp(U.uHover.value, hov === 'core' ? 1 : 0, 8, dt);
      U.uActive.value = damp(U.uActive.value, act * 0.5, 3, dt);
      U.uDim.value = damp(U.uDim.value, hub || ch === 'skills' || tr ? 0.35 : 0, 4, dt);
      this.core.envU.uHover.value = U.uHover.value + U.uActive.value;
    }

    // Timeline instrument
    const tlVis = ch === 'career' || ch === 'credentials' ? 1 : ch === 'hero' || ch === 'contact' ? 0.55 : 0.32;
    this.tlVis = damp(this.tlVis ?? 0.55, tlVis, 3, dt);
    for (const p of this.tl.parts) p.U.uAlpha.value = p.base * this.tlVis;
    for (const [rid, rb] of Object.entries(this.roleParts)) {
      const id = 'role:' + rid;
      rb.U.uHover.value = damp(rb.U.uHover.value, hov === id || f.roleHover === rid ? 1 : 0, 8, dt);
      rb.U.uActive.value = damp(rb.U.uActive.value, sel === id ? 1 : 0, 6, dt);
    }
    this.markU.uVis.value = damp(this.markU.uVis.value, ch === 'credentials' ? 1 : ch === 'career' ? 0.75 : 0.3, 3, dt);
    const md = this.markState.data;
    this.events.forEach((ev, i) => { const id = 'evt:' + i; md[i * 4] = damp(md[i * 4], hov === id ? 1 : 0, 9, dt); });
    this.markState.tex.needsUpdate = true;
    for (const p of this.gimParts) p.U.uAlpha.value = p.base * (0.5 + this.tlVis * 0.5);

    // Skills
    const sv = ch === 'skills' ? 1 : 0.16;
    this.skillU.uVis.value = damp(this.skillU.uVis.value, sv, 3, dt);
    const sdd = this.skillState.data, sc = this.skillCur;
    const hovSkill = hov && hov.startsWith('skill:') ? +hov.slice(6) : -1;
    for (const s of this.skillList) {
      const i = s.idx;
      let hi = 0, dm = 0;
      if (sk) {
        if (sk.matches) { hi = sk.matches.has(i) ? 1 : 0; dm = sk.matches.has(i) ? 0 : 0.85; }
        else if (sk.cat) { hi = s.cat === sk.cat ? 0.35 : 0; dm = s.cat === sk.cat ? 0 : 0.8; }
      }
      if (hovSkill === i) { hi = 1; dm = 0; }
      if (hov && hov.startsWith('proj:') || (sel && sel.startsWith('proj:'))) {
        const nid = hov && hov.startsWith('proj:') ? hov : sel;
        if (this._related(nid).has('skill:' + i)) hi = Math.max(hi, 0.9);
      }
      sc[i * 4] = damp(sc[i * 4], hi, 8, dt); sc[i * 4 + 1] = damp(sc[i * 4 + 1], dm, 6, dt);
      sdd[i * 4] = sc[i * 4]; sdd[i * 4 + 1] = sc[i * 4 + 1]; sdd[i * 4 + 3] = 1;
    }
    this.skillState.tex.needsUpdate = true;
  }

  /* ── camera ── */

  _updateCamera(dt) {
    const g = this.goal, r = this.rig, d = this.drag;
    const k = this.reduced ? 7 : 2.4;
    r.target.x = damp(r.target.x, g.target.x, k, dt);
    r.target.y = damp(r.target.y, g.target.y, k, dt);
    r.target.z = damp(r.target.z, g.target.z, k, dt);
    r.dist = damp(r.dist, g.dist, k * 0.9, dt);
    r.yaw = angDamp(r.yaw, g.yaw, k, dt);
    r.pitch = damp(r.pitch, g.pitch, k, dt);
    r.shiftX = damp(r.shiftX, g.shiftX, 3, dt);
    r.shiftY = damp(r.shiftY, g.shiftY, 3, dt);
    if (!d.active) {
      d.yaw += d.vy * dt; d.pitch += d.vp * dt;
      d.vy *= Math.exp(-3.4 * dt); d.vp *= Math.exp(-3.4 * dt);
      d.pitch = clamp(d.pitch, -0.9, 0.9);
      if (d.release > 0) {
        d.yaw = angDamp(d.yaw, 0, 1.6, dt); d.pitch = damp(d.pitch, 0, 1.6, dt);
        d.release = Math.abs(wrapPi(d.yaw)) + Math.abs(d.pitch) > 0.002 ? 1 : 0;
      }
    }
    if (g.auto && !this.reduced) this.orbit += dt * 0.04 * g.auto;
    else this.orbit = angDamp(wrapPi(this.orbit), 0, 1.2, dt);
    this.par.x = damp(this.par.x, this.ptr.on ? this.ptr.nx || 0 : 0, 2, dt);
    this.par.y = damp(this.par.y, this.ptr.on ? this.ptr.ny || 0 : 0, 2, dt);
    const yaw = r.yaw + d.yaw + this.orbit + (this.reduced ? 0 : this.par.x * 0.05);
    const pitch = clamp(r.pitch + d.pitch - (this.reduced ? 0 : this.par.y * 0.035), -1.2, 1.35);
    const cp = Math.cos(pitch);
    const c = this.camera;
    c.position.set(r.target.x + Math.sin(yaw) * cp * r.dist, r.target.y + Math.sin(pitch) * r.dist, r.target.z + Math.cos(yaw) * cp * r.dist);
    c.lookAt(r.target);
    c.setViewOffset(this.W, this.H, -r.shiftX * this.W, r.shiftY * this.H, this.W, this.H);
    c.updateMatrixWorld();
    this.cam = { yaw, pitch, dist: r.dist };
  }

  /* ── projection & picking ── */

  _project() {
    const c = this.camera, v = this.v;
    const W = this.W, H = this.H;
    const cpos = c.position;
    const coreD = cpos.length();
    v.set(0, 0, 0).project(c);
    const csx = (v.x * 0.5 + 0.5) * W, csy = (-v.y * 0.5 + 0.5) * H;
    const coreR = (1.05 * this.scaleCss) / Math.max(coreD, 0.1);
    for (const e of this.registry) {
      v.copy(e.pos).project(c);
      e.sx = (v.x * 0.5 + 0.5) * W;
      e.sy = (-v.y * 0.5 + 0.5) * H;
      e.front = v.z > -1 && v.z < 1;
      e.depth = cpos.distanceTo(e.pos);
      e.pr = Math.max(e.type === 'hub' ? 26 : e.type === 'skill' ? 9 : e.type === 'evt' ? 8 : 15, (e.r * this.scaleCss) / Math.max(e.depth, 0.1));
      e.occ = e.type !== 'core' && e.depth > coreD + 0.6 && Math.hypot(e.sx - csx, e.sy - csy) < coreR;
    }
  }

  pick(x, y, types) {
    let best = null, bd = Infinity;
    for (const e of this.registry) {
      if (!types.has(e.type) || !e.front || e.occ) continue;
      const d = Math.hypot(e.sx - x, e.sy - y);
      if (d < e.pr && d / e.pr + e.depth * 0.002 < bd) { best = e; bd = d / e.pr + e.depth * 0.002; }
    }
    return best;
  }

  /* ── loop ── */

  update(dt) {
    this.t += dt;
    this.U.uTime.value = this.t;
    if (this.introOn && this.intro < 1) {
      this.introT += dt;
      this.intro = clamp(this.introT / this.introDur);
    }
    this.U.uIntro.value = 1 - Math.pow(1 - this.intro, 2);
    this._updateCamera(dt);
    if (this.ptr.on) {
      this.ndc.set((this.ptr.x / this.W) * 2 - 1, -(this.ptr.y / this.H) * 2 + 1);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      this.dustU.uRayO.value.copy(this.raycaster.ray.origin);
      this.dustU.uRayD.value.copy(this.raycaster.ray.direction);
    }
    this.ptr.s = damp(this.ptr.s, this.ptr.on && !this.reduced ? 1 : 0, 3, dt);
    this.dustU.uPointer.value = this.ptr.s;
    this._updateStates(dt);
    this._updateFact(dt);
    this._updateComet(dt);
    this.gimA.rotation.y = this.t * 0.05;
    this.gimB.rotation.z = this.t * 0.035;
    this.core.grp.rotation.y = this.t * 0.03;
    const fx = 0.5 + this.rig.shiftX, fy = 0.5 + this.rig.shiftY;
    this.bg.uniforms.uFocus.value.set(fx, fy);
    this._project();
  }

  render() {
    this.grade.uniforms.uTime.value = this.t;
    this.composer.render();
  }

  resize(W = window.innerWidth, H = window.innerHeight, mobile) {
    this.W = Math.max(1, W);
    this.H = Math.max(1, H);
    if (mobile !== undefined) this.mobile = mobile;
    this.camera.fov = this.mobile ? 46 : 38;
    this.camera.aspect = this.W / this.H;
    this.renderer.setSize(this.W, this.H, false);
    this.composer.setSize(this.W, this.H);
    if (this._composerDpr !== this.dpr) { this.composer.setPixelRatio(this.dpr); this._composerDpr = this.dpr; }
    const f = Math.tan((this.camera.fov * Math.PI) / 360) * 2;
    this.U.uScale.value = (this.H * this.dpr) / f;
    this.scaleCss = this.H / f;
    this.bg.uniforms.uAspect.value = this.W / this.H;
    this.grade.uniforms.uRes.value.set(this.W * this.dpr, this.H * this.dpr);
    this._updateCamera(0);
  }

  async warm() {
    try {
      if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
    } catch (e) { /* compile happens on first render instead */ }
  }
}
