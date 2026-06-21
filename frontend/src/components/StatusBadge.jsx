import React from 'react';
import { C, S } from '../theme.jsx';

const STATUS = {
  online:  { color: C.green,  label: 'Online' },
  stale:   { color: C.amber,  label: 'Stale' },
  offline: { color: C.red,    label: 'Offline' },
  unknown: { color: 'rgba(255,255,255,0.2)', label: 'Unknown' },
};

export default function StatusBadge({ status = 'unknown' }) {
  const { color, label } = STATUS[status] ?? STATUS.unknown;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={S.dot(status)} />
      <span style={{ fontSize: 12, fontWeight: 500, color }}>
        {label}
      </span>
    </span>
  );
}
