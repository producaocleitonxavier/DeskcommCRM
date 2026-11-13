import type { Metadata } from "next";
import { ContactsListClient } from "./_client";
import { exigirPortaDoPerfil } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contatos" };

export default async function ContactsPage() {
  await exigirPortaDoPerfil("/app/contacts");
  return <ContactsListClient />;
}
