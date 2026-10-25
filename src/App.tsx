import React from 'react';

export default function App() {
  return (
    <iframe
      src="/carelink-v6.html?v=6.6.6"
      title="CareLink C-DIMS — LOMAMO Foundation Operating System"
      style={{
        border: 'none',
        width: '100vw',
        height: '100dvh',
        display: 'block',
        margin: 0,
        padding: 0,
      }}
      allow="geolocation; clipboard-write"
    />
  );
}
