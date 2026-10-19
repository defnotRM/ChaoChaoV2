import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HireProductRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/product/${id}/rent`);
}
