/**
 * O CAMINHO DE UM ARQUIVO PERTENCE A ESTA ORGANIZAÇÃO?
 *
 * Os baldes privados (gabinete-anexos, gabinete-identidade, gabinete-liderancas,
 * gabinete-obras, whatsapp-media) só são lidos com a chave de serviço, que ignora
 * as regras do banco. Vários lugares liam o caminho de volta de uma COLUNA — que
 * um membro consegue gravar — e assinavam o que estivesse lá. Um membro do
 * gabinete A apontava a coluna para `<gabinete B>/assinatura.png` e recebia o
 * endereço assinado do arquivo do outro (auditoria de 13/nov/2026).
 *
 * Régua única: todo caminho começa com `<id da organização>/`, sem trecho vazio,
 * `.`, `..` ou barra invertida. Quem assina, baixa ou remove com a chave de
 * serviço confere ANTES. Mesma ideia de `isMediaPathOwnedBy` (whatsapp-media),
 * sem exigir a conversa.
 *
 * Puro, para ser testável.
 */
export function caminhoPertenceAOrg(path: string | null | undefined, orgId: string | null | undefined): path is string {
  if (typeof path !== "string" || !path || !orgId) return false;
  const prefixo = `${orgId}/`;
  if (!path.startsWith(prefixo)) return false;
  const resto = path.slice(prefixo.length);
  if (!resto || resto.includes("\\")) return false;
  return resto.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}
