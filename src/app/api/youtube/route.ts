import { NextRequest, NextResponse } from 'next/server';

/**
 * YouTube Data API v3 — brand channel + video intelligence.
 *
 * Uses the official YouTube Data API v3. Free tier gives 10,000
 * quota units/day (search = 100 units, channel = 1 unit, so ~100
 * searches + unlimited channel lookups). Generous for an internal
 * tool.
 *
 * Get a key at console.cloud.google.com → enable YouTube Data API
 * v3 → Credentials → Create API Key. Set it as YOUTUBE_API_KEY in
 * your env vars.
 *
 * Usage:
 *   GET /api/youtube?q=lenskart                    (search videos)
 *   GET /api/youtube?q=lenskart&type=channel       (search channels)
 *   GET /api/youtube?channel=UCxxx                 (channel details + latest)
 */

const KEY = process.env.YOUTUBE_API_KEY || '';

function needsSetup() {
  return {
    items: [],
    needsSetup: true,
    setupInstructions: {
      title: 'Connect YouTube Data API',
      steps: [
        'Go to console.cloud.google.com → create a project (free)',
        'Navigate to APIs & Services → Library → enable "YouTube Data API v3"',
        'Credentials → Create Credentials → API Key',
        'Copy the key and add it to Vercel env vars as YOUTUBE_API_KEY',
        'Redeploy — YouTube intelligence will work automatically',
        'Free tier: 10,000 quota units / day (≈100 searches)',
      ],
    },
  };
}

export async function GET(request: NextRequest) {
  if (!KEY) return NextResponse.json(needsSetup());

  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.trim() || '';
  const channel = searchParams.get('channel')?.trim() || '';
  const type = searchParams.get('type') || 'video'; // video | channel
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const regionCode = searchParams.get('region') || 'IN';

  try {
    // ── Channel details mode ──
    if (channel) {
      const chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channel}&key=${KEY}`;
      const chRes = await fetch(chUrl);
      const chData = await chRes.json();
      if (chData.error) return NextResponse.json({ error: chData.error.message }, { status: 502 });

      const ch = chData.items?.[0];
      if (!ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

      // Latest 10 videos from the channel
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel}&order=date&type=video&maxResults=10&key=${KEY}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();

      // Hydrate video stats
      const videoIds = (searchData.items || []).map((v: { id: { videoId: string } }) => v.id.videoId).filter(Boolean);
      let videosData: { items?: Array<Record<string, unknown>> } = { items: [] };
      if (videoIds.length > 0) {
        const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${KEY}`;
        const vRes = await fetch(vUrl);
        videosData = await vRes.json();
      }

      return NextResponse.json({
        channel: {
          id: ch.id,
          title: ch.snippet?.title,
          description: ch.snippet?.description,
          thumbnail: ch.snippet?.thumbnails?.high?.url || ch.snippet?.thumbnails?.default?.url,
          country: ch.snippet?.country,
          publishedAt: ch.snippet?.publishedAt,
          banner: ch.brandingSettings?.image?.bannerExternalUrl,
          subscribers: Number(ch.statistics?.subscriberCount || 0),
          videoCount: Number(ch.statistics?.videoCount || 0),
          viewCount: Number(ch.statistics?.viewCount || 0),
          url: `https://youtube.com/channel/${ch.id}`,
        },
        videos: (videosData.items || []).map((v: Record<string, unknown>) => {
          const snippet = v.snippet as Record<string, unknown> | undefined;
          const stats = v.statistics as Record<string, unknown> | undefined;
          const details = v.contentDetails as Record<string, unknown> | undefined;
          const thumbs = snippet?.thumbnails as Record<string, { url: string }> | undefined;
          return {
            id: v.id,
            title: snippet?.title,
            description: snippet?.description,
            thumbnail: thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url,
            publishedAt: snippet?.publishedAt,
            views: Number(stats?.viewCount || 0),
            likes: Number(stats?.likeCount || 0),
            comments: Number(stats?.commentCount || 0),
            duration: details?.duration,
            url: `https://youtube.com/watch?v=${v.id}`,
          };
        }),
      });
    }

    // ── Search mode ──
    if (!q) return NextResponse.json({ error: 'q or channel param required' }, { status: 400 });

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=${type}&maxResults=${limit}&regionCode=${regionCode}&key=${KEY}`;
    const res = await fetch(searchUrl);
    const data = await res.json();
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 502 });

    if (type === 'channel') {
      const channelIds = (data.items || []).map((c: { id: { channelId: string } }) => c.id.channelId).filter(Boolean);
      if (channelIds.length === 0) return NextResponse.json({ channels: [] });
      const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds.join(',')}&key=${KEY}`;
      const statsRes = await fetch(statsUrl);
      const statsData = await statsRes.json();
      return NextResponse.json({
        channels: (statsData.items || []).map((ch: Record<string, unknown>) => {
          const snippet = ch.snippet as Record<string, unknown> | undefined;
          const stats = ch.statistics as Record<string, unknown> | undefined;
          const thumbs = snippet?.thumbnails as Record<string, { url: string }> | undefined;
          return {
            id: ch.id,
            title: snippet?.title,
            description: snippet?.description,
            thumbnail: thumbs?.high?.url || thumbs?.default?.url,
            country: snippet?.country,
            subscribers: Number(stats?.subscriberCount || 0),
            videoCount: Number(stats?.videoCount || 0),
            viewCount: Number(stats?.viewCount || 0),
            url: `https://youtube.com/channel/${ch.id}`,
          };
        }),
      });
    }

    // Video search — hydrate stats
    const videoIds = (data.items || []).map((v: { id: { videoId: string } }) => v.id?.videoId).filter(Boolean);
    if (videoIds.length === 0) return NextResponse.json({ videos: [] });

    const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${KEY}`;
    const vRes = await fetch(vUrl);
    const vData = await vRes.json();

    return NextResponse.json({
      videos: (vData.items || []).map((v: Record<string, unknown>) => {
        const snippet = v.snippet as Record<string, unknown> | undefined;
        const stats = v.statistics as Record<string, unknown> | undefined;
        const thumbs = snippet?.thumbnails as Record<string, { url: string }> | undefined;
        return {
          id: v.id,
          title: snippet?.title,
          channelTitle: snippet?.channelTitle,
          channelId: snippet?.channelId,
          description: snippet?.description,
          thumbnail: thumbs?.high?.url || thumbs?.medium?.url,
          publishedAt: snippet?.publishedAt,
          views: Number(stats?.viewCount || 0),
          likes: Number(stats?.likeCount || 0),
          comments: Number(stats?.commentCount || 0),
          url: `https://youtube.com/watch?v=${v.id}`,
        };
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'YouTube fetch failed' }, { status: 500 });
  }
}
