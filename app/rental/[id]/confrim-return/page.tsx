import { redirect } from "next/navigation";

export default async function ConfrimReturnRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/rental/${id}/confirm-return`);
}
