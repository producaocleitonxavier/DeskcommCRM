import type { MetadataRoute } from "next";

import { marcaDaSaida } from "@/lib/branding/saida";

// A imagem distribuída é construída sem a marca da instalação. Uma função
// async, sozinha, ainda pode ser prerenderizada com o nome de fallback do build.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const marca = await marcaDaSaida(null);
  // Ícone do app = o ELMO sobre fundo escuro (public/icon-*.png) — o mesmo da
  // tela de login. É marca FIXA do produto (como o elmo do login), então usa
  // arquivo estático em vez do gerador por favicon (que mostrava a letra "G").
  // `v` só pra furar cache do manifesto/ícone quando a arte mudar.
  const v = "?v=gip-elmo-1";
  return {
    name: marca.nome,
    short_name: marca.nome,
    display: "standalone",
    start_url: "/app",
    scope: "/",
    icons: [
      { src: `/icon-192.png${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icon-512.png${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/icon-192.png${v}`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `/icon-512.png${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
