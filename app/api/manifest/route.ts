import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activity = searchParams.get('activity');

  // Start URL'i dinamik yapıyoruz
  // Eğer activity varsa, start_url'e ekle
  // Yoksa ana sayfa
  const startUrl = activity ? `/?activity=${activity}` : '/';

  const manifest = {
    name: "Thrive OnDemand",
    short_name: "Thrive",
    description: "Thrive OnDemand Agent Chat",
    start_url: startUrl,
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192 512x512",
        type: "image/png"
      }
    ]
  };

  return NextResponse.json(manifest);
}

