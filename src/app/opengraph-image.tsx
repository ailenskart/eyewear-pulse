import { ImageResponse } from 'next/og';

export const alt = 'Lenzy — Eyewear Creative Intelligence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 80,
          background: '#0A0A0A',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #FF6B00 0%, #7C3AED 100%)',
              borderRadius: 20,
              fontSize: 62,
              fontWeight: 800,
              letterSpacing: -2,
            }}
          >
            L
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: -3,
            }}
          >
            Lenzy
          </div>
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: -1,
            lineHeight: 1.1,
            marginBottom: 24,
            maxWidth: 900,
          }}
        >
          Eyewear Creative Intelligence
        </div>
        <div
          style={{
            fontSize: 26,
            color: '#A1A1AA',
            fontWeight: 400,
            maxWidth: 900,
            lineHeight: 1.35,
          }}
        >
          Track global eyewear brands on Instagram and reimagine their posts for your catalog.
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 80,
            fontSize: 22,
            color: '#71717A',
          }}
        >
          lenzy.studio
        </div>
      </div>
    ),
    { ...size },
  );
}
