import { AsksApp } from "@/components/AsksApp";

export default async function Page({ searchParams }: { searchParams: Promise<{ channel?: string; videos?: string; months?: string }> }) {
  const { channel, videos, months } = await searchParams;
  return <AsksApp initialChannel={channel ?? ""} videos={Number(videos) || undefined} initialMonths={months === undefined ? undefined : Number(months)} />;
}
