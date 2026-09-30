// Convierte el árbol del programa en diagramas de flujo con coordenadas: uno para el bloque
// principal y otro por cada función. Como el pseudocódigo es estructurado (sin saltos), cada
// bloque se maqueta de forma recursiva como un "fragmento" con una entrada arriba y una salida
// abajo, ambas en el eje `cx`. Un fragmento `terminal` acaba siempre en RETORNAR y no tiene salida.

import { walkExpr } from './parser.js'

const CHAR_W = 7.9
const NODE_H = 40
const GAP = 26
const MAX_LABEL = 36

const LABELS = {
  es: { start: 'Inicio', end: 'Fin', yes: 'Sí', no: 'No', to: 'hasta', ret: 'Devolver', main: 'Principal' },
  en: { start: 'Start', end: 'End', yes: 'Yes', no: 'No', to: 'to', ret: 'Return', main: 'Main' },
}

function clip(text) {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text
}

function makeNode(stmt, kind, text, lang, sub = null) {
  const label = clip(text)
  const tw = label.length * CHAR_W
  let w
  let h = NODE_H
  switch (kind) {
    case 'terminator': w = Math.max(96, tw + 44); break
    case 'io': w = Math.max(110, tw + 76); break
    case 'decision': w = Math.max(110, tw * 1.4 + 34); h = 60; break
    case 'loop': w = Math.max(120, tw + 58); h = 46; break
    case 'call': w = Math.max(110, tw + 52); break
    default: w = Math.max(96, tw + 32)
  }
  return { id: stmt.id, kind, sub, label, full: text, line: stmt.line, lang, x: 0, y: 0, w: Math.round(w), h }
}

const empty = () => ({ w: 0, h: 0, cx: 0, nodes: [], edges: [], entryArrow: true, terminal: false })

function shift(frag, dx, dy) {
  return {
    nodes: frag.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
    edges: frag.edges.map((e) => ({ ...e, points: e.points.map(([x, y]) => [x + dx, y + dy]), labelAt: e.labelAt && [e.labelAt[0] + dx, e.labelAt[1] + dy] })),
  }
}

function nodeFrag(node, terminal = false) {
  node.x = 0
  node.y = 0
  return { w: node.w, h: node.h, cx: node.w / 2, nodes: [node], edges: [], entryArrow: true, terminal }
}

function sequence(frags) {
  const parts = []
  for (const f of frags) {
    if (!(f.nodes.length || f.edges.length)) continue
    parts.push(f)
    if (f.terminal) break // lo que va detrás de un RETORNAR no se alcanza
  }
  if (parts.length === 0) return empty()
  const left = Math.max(...parts.map((f) => f.cx))
  const right = Math.max(...parts.map((f) => f.w - f.cx))
  const nodes = []
  const edges = []
  let y = 0
  parts.forEach((f, i) => {
    if (i > 0) {
      edges.push({ id: `seq:${f.nodes[0]?.id ?? i}:${i}`, points: [[left, y], [left, y + GAP]], arrow: f.entryArrow, kind: 'flow' })
      y += GAP
    }
    const moved = shift(f, left - f.cx, y)
    nodes.push(...moved.nodes)
    edges.push(...moved.edges)
    y += f.h
  })
  return { w: left + right, h: y, cx: left, nodes, edges, entryArrow: parts[0].entryArrow, terminal: parts.at(-1).terminal }
}

function layoutIf(stmt, ctx) {
  const L = ctx.L
  const d = makeNode(stmt, 'decision', stmt.cond ? stmt.cond.src : '?', ctx.lang)
  const T = layoutBlock(stmt.then, ctx)
  const E = stmt.else ? layoutBlock(stmt.else, ctx) : empty()
  const dL = Math.max(d.w / 2 + 22, T.w - T.cx + 22)
  const dR = Math.max(d.w / 2 + 22, E.cx + 22)
  const left = Math.max(dL + T.cx, d.w / 2)
  const right = Math.max(dR + (E.w - E.cx), d.w / 2)
  const cx = left
  const tx = cx - dL
  const ex = cx + dR
  const midY = d.h / 2
  const branchTop = d.h + 24
  const terminal = T.terminal && E.terminal
  const mergeY = branchTop + Math.max(T.h, E.h) + (terminal ? 0 : 24)
  d.x = cx - d.w / 2
  d.y = 0

  const nodes = [d]
  const edges = []
  const yesEmpty = T.nodes.length === 0
  const noEmpty = E.nodes.length === 0
  edges.push({
    id: `${stmt.id}:yes`, kind: 'yes', label: L.yes, labelAt: [cx - d.w / 2 - 8, midY - 7], labelAnchor: 'end',
    points: yesEmpty ? [[cx - d.w / 2, midY], [tx, midY], [tx, mergeY], [cx, mergeY]] : [[cx - d.w / 2, midY], [tx, midY], [tx, branchTop]],
    arrow: !yesEmpty && T.entryArrow,
  })
  edges.push({
    id: `${stmt.id}:no`, kind: 'no', label: L.no, labelAt: [cx + d.w / 2 + 8, midY - 7], labelAnchor: 'start',
    points: noEmpty ? [[cx + d.w / 2, midY], [ex, midY], [ex, mergeY], [cx, mergeY]] : [[cx + d.w / 2, midY], [ex, midY], [ex, branchTop]],
    arrow: !noEmpty && E.entryArrow,
  })
  if (!yesEmpty) {
    const t = shift(T, tx - T.cx, branchTop)
    nodes.push(...t.nodes)
    edges.push(...t.edges)
    if (!T.terminal) edges.push({ id: `${stmt.id}:yes-out`, kind: 'flow', points: [[tx, branchTop + T.h], [tx, mergeY], [cx, mergeY]], arrow: false })
  }
  if (!noEmpty) {
    const e = shift(E, ex - E.cx, branchTop)
    nodes.push(...e.nodes)
    edges.push(...e.edges)
    if (!E.terminal) edges.push({ id: `${stmt.id}:no-out`, kind: 'flow', points: [[ex, branchTop + E.h], [ex, mergeY], [cx, mergeY]], arrow: false })
  }
  return { w: left + right, h: mergeY, cx, nodes, edges, entryArrow: true, terminal }
}

function layoutLoop(stmt, ctx) {
  const L = ctx.L
  const isFor = stmt.type === 'for'
  const text = isFor
    ? `${stmt.var} = ${stmt.from?.src ?? '?'} ${L.to} ${stmt.to?.src ?? '?'}`
    : stmt.cond ? stmt.cond.src : '?'
  const d = makeNode(stmt, isFor ? 'loop' : 'decision', text, ctx.lang)
  const B = layoutBlock(stmt.body, ctx)
  const PRE = 22
  const JOIN = 9
  const left = Math.max(d.w / 2, B.cx) + 36
  const right = Math.max(d.w / 2, B.w - B.cx) + 40
  const cx = left
  const laneL = 6
  const laneR = left + right - 6
  const dTop = PRE
  const midY = dTop + d.h / 2
  const bodyTop = dTop + d.h + 28
  const bodyBottom = bodyTop + B.h
  const backY = bodyBottom + 18
  const exitY = backY + 22
  d.x = cx - d.w / 2
  d.y = dTop

  const nodes = [d]
  const edges = [{ id: `${stmt.id}:in`, kind: 'flow', points: [[cx, 0], [cx, dTop]], arrow: true }]
  const bodyEmpty = B.nodes.length === 0
  if (!bodyEmpty) {
    const b = shift(B, cx - B.cx, bodyTop)
    nodes.push(...b.nodes)
    edges.push(...b.edges)
  }
  edges.push({
    id: `${stmt.id}:yes`, kind: 'yes', label: L.yes, labelAt: [cx + 8, dTop + d.h + 16], labelAnchor: 'start',
    points: [[cx, dTop + d.h], [cx, bodyEmpty ? backY : bodyTop]],
    arrow: !bodyEmpty && B.entryArrow,
  })
  if (!B.terminal) {
    edges.push({
      id: `${stmt.id}:back`, kind: 'back',
      label: isFor ? `${stmt.var} = ${stmt.var} + 1` : null,
      labelAt: [cx - 10, backY - 6], labelAnchor: 'end',
      points: [[cx, bodyEmpty ? backY : bodyBottom], [cx, backY], [laneL, backY], [laneL, JOIN], [cx, JOIN]],
      arrow: true,
    })
  }
  edges.push({
    id: `${stmt.id}:no`, kind: 'no', label: L.no, labelAt: [cx + d.w / 2 + 8, midY + 14], labelAnchor: 'start',
    points: [[cx + d.w / 2, midY], [laneR, midY], [laneR, exitY], [cx, exitY]],
    arrow: false,
  })
  // La entrada del bucle ya lleva flecha propia: la conexión que llega no la repite.
  return { w: left + right, h: exitY, cx, nodes, edges, entryArrow: false, terminal: false }
}

/** REPETIR … HASTA_QUE: el cuerpo va primero y la condición al final; si no se cumple, vuelve arriba. */
function layoutRepeat(stmt, ctx) {
  const L = ctx.L
  const d = makeNode({ ...stmt, line: stmt.endLine ?? stmt.line }, 'decision', stmt.cond ? stmt.cond.src : '?', ctx.lang)
  const B = layoutBlock(stmt.body, ctx)
  const PRE = 26
  const JOIN = 10
  const left = Math.max(d.w / 2, B.cx) + 36
  const right = Math.max(d.w / 2 + 30, B.w - B.cx) + 16
  const cx = left
  const laneL = 6
  const bodyEmpty = B.nodes.length === 0
  const bodyTop = PRE
  const dTop = bodyEmpty ? PRE : bodyTop + B.h + 26
  const midY = dTop + d.h / 2
  const exitY = dTop + d.h + 26
  d.x = cx - d.w / 2
  d.y = dTop

  const nodes = [d]
  const edges = [{ id: `${stmt.id}:in`, kind: 'flow', points: [[cx, 0], [cx, bodyEmpty ? dTop : bodyTop]], arrow: bodyEmpty || B.entryArrow }]
  if (!bodyEmpty) {
    const b = shift(B, cx - B.cx, bodyTop)
    nodes.push(...b.nodes)
    edges.push(...b.edges)
    if (!B.terminal) edges.push({ id: `${stmt.id}:body-out`, kind: 'flow', points: [[cx, bodyTop + B.h], [cx, dTop]], arrow: true })
  }
  edges.push({
    id: `${stmt.id}:no`, kind: 'no', label: L.no, labelAt: [cx - d.w / 2 - 8, midY - 7], labelAnchor: 'end',
    points: [[cx - d.w / 2, midY], [laneL, midY], [laneL, JOIN], [cx, JOIN]],
    arrow: true,
  })
  edges.push({
    id: `${stmt.id}:yes`, kind: 'yes', label: L.yes, labelAt: [cx + 8, dTop + d.h + 14], labelAnchor: 'start',
    points: [[cx, dTop + d.h], [cx, exitY]],
    arrow: false,
  })
  return { w: left + right, h: exitY, cx, nodes, edges, entryArrow: false, terminal: false }
}

function hasUserCall(e) {
  let found = false
  walkExpr(e, (x) => { if (x.k === 'call' && !x.builtin) found = true })
  return found
}

function layoutStmt(stmt, ctx) {
  const { lang, L } = ctx
  switch (stmt.type) {
    case 'assign':
      return nodeFrag(makeNode(stmt, hasUserCall(stmt.expr) ? 'call' : 'process', `${stmt.target.src} = ${stmt.expr.src}`, lang))
    case 'call':
      return nodeFrag(makeNode(stmt, 'call', stmt.call.src, lang))
    case 'print':
      return nodeFrag(makeNode(stmt, 'io', stmt.args.map((a) => a.src).join(', '), lang, 'out'))
    case 'read':
      return nodeFrag(makeNode(stmt, 'io', stmt.targets.map((t) => t.src).join(', '), lang, 'in'))
    case 'return':
      return nodeFrag(makeNode(stmt, 'terminator', stmt.expr ? `${L.ret} ${stmt.expr.src}` : L.ret, lang, 'return'), true)
    case 'if':
      return layoutIf(stmt, ctx)
    case 'while':
    case 'for':
      return layoutLoop(stmt, ctx)
    case 'repeat':
      return layoutRepeat(stmt, ctx)
    default:
      return empty()
  }
}

function layoutBlock(stmts, ctx) {
  return sequence(stmts.map((s) => layoutStmt(s, ctx)))
}

const MARGIN = 36

function finish(frag, extra) {
  const moved = shift(frag, MARGIN, MARGIN)
  return { nodes: moved.nodes, edges: moved.edges, width: frag.w + MARGIN * 2, height: frag.h + MARGIN * 2, ...extra }
}

/**
 * Diagramas del programa: el principal y uno por función.
 * @returns {Array<{ key, title, name, nodes, edges, width, height, lang }>}
 */
export function buildFlowchart(ast) {
  const lang = ast.lang === 'en' ? 'en' : 'es'
  const ctx = { lang, L: LABELS[lang] }
  const L = ctx.L
  const start = makeNode({ id: 'start', line: ast.startLine }, 'terminator', L.start, lang)
  const end = makeNode({ id: 'end', line: ast.endLine }, 'terminator', L.end, lang)
  const diagrams = [
    finish(sequence([nodeFrag(start), layoutBlock(ast.body, ctx), nodeFrag(end)]), { key: 'main', title: L.main, name: null, lang }),
  ]
  for (const fn of ast.functions) {
    if (fn.broken) continue
    const head = makeNode({ id: `fstart:${fn.name}`, line: fn.line }, 'terminator', `${fn.name}(${fn.params.join(', ')})`, lang, 'fn')
    const body = layoutBlock(fn.body, ctx)
    const parts = [nodeFrag(head), body]
    if (!body.terminal) parts.push(nodeFrag(makeNode({ id: `fend:${fn.name}`, line: fn.endLine }, 'terminator', `${L.end} ${fn.name}`, lang, 'fn')))
    diagrams.push(finish(sequence(parts), { key: `fn:${fn.name}`, title: `${fn.name}(${fn.params.join(', ')})`, name: fn.name, lang }))
  }
  return diagrams
}
