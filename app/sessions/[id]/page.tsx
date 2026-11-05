import ReviewClient from "@/components/ReviewClient";

export default async function SessionPage({
  params,
}: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  return <ReviewClient sessionId={Number(id)} />;
}
