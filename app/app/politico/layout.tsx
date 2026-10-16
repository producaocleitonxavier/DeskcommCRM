import { WarRoomShell } from "@/components/politico/war-room-shell";

export default function PoliticoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WarRoomShell>{children}</WarRoomShell>;
}
