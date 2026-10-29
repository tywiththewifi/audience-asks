import { AsksApp } from "@/components/AsksApp";

export default async function Page({ searchParams }: { searchParams: Promise<{ channel?: string; videos?: string }> }) {
  const { channel, videos } = await searchParams;
  return <AsksApp initialChannel={channel ?? ""} videos={Number(videos) || undefined} />;
}
