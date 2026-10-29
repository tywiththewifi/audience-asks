import { AsksApp } from "@/components/AsksApp";

export default async function Page({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const { channel } = await searchParams;
  return <AsksApp initialChannel={channel ?? ""} />;
}
