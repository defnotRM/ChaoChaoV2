import { redirect } from "next/navigation";

export default async function ConfirmRecieveRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/rental/${id}/confirm-receive`);
}
