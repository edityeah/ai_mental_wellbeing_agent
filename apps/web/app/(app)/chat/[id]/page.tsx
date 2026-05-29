import { ChatScreen } from "@/components/chat/ChatScreen";

export default async function ChatById({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatScreen initialId={id} />;
}
