/**
 * Variável do link único da pesquisa (merge em contacts.custom_fields.pesquisa_link).
 * Fica FORA do arquivo "use server" (pesquisa-disparo.ts) porque o build de produção
 * (Turbopack) só permite exportar funções async de um módulo "use server" — exportar
 * um const de lá quebra o build inteiro. Servidor e cliente importam daqui.
 */
export const VARIAVEL_LINK = "{{contato.pesquisa_link}}";
