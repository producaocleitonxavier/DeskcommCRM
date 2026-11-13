"use client";

import { useT } from "@/hooks/i18n/useT";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, PencilSimple, Trash } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useMessageTemplates, type MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { TemplateFormDialog } from "./TemplateFormDialog";
import { criarRespostasSugeridas } from "@/app/actions/politico/respostas-prontas";

const TEMPLATES_KEY = ["message-templates"];

interface Props {
  canShare: boolean;
  currentUserId: string;
}

export function TemplatesClient({ canShare, currentUserId }: Props) {
  const t = useT();
  const { data: templates, isLoading } = useMessageTemplates();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/v1/message-templates/${id}`),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  // "Usar as respostas sugeridas": o conjunto inicial do gabinete, em um clique.
  const [criandoSugeridas, setCriandoSugeridas] = React.useState(false);
  const [avisoSugeridas, setAvisoSugeridas] = React.useState<string | null>(null);
  async function usarSugeridas() {
    setCriandoSugeridas(true);
    setAvisoSugeridas(null);
    try {
      const r = await criarRespostasSugeridas();
      if (!r.ok) setAvisoSugeridas(r.erro);
      else await qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    } catch {
      setAvisoSugeridas("Não consegui criar as respostas sugeridas. Tente de novo.");
    } finally {
      setCriandoSugeridas(false);
    }
  }
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MessageTemplate | null>(null);
  // Deep link: `/app/templates?modelo=<id>` abre aquele modelo. É o link que a
  // integração devolve ("use o modelo X") e que a tela não tinha — sem ele, quem
  // recebe a mensagem cai na lista e tem de caçar de qual texto se falava.
  // `?.` porque o hook devolve null fora de um contexto de navegação (o que
  // acontece em teste e em render estático), como no resto do repo.
  const idDoModelo = useSearchParams()?.get("modelo") ?? null;
  const [abertoPelaUrl, setAbertoPelaUrl] = React.useState(false);
  // Só quem pode editar/apagar pela RLS vê as ações: o dono do pessoal, ou
  // manager+ no compartilhado (owner null). Sem isto, um agent veria botões
  // que o backend rejeita (404/nada apagado).
  const canModify = React.useCallback(
    (template: MessageTemplate) =>
      template.owner_user_id === currentUserId || (template.owner_user_id === null && canShare),
    [canShare, currentUserId],
  );

  React.useEffect(() => {
    if (abertoPelaUrl || !idDoModelo) return;
    // A lista chega depois: enquanto ela não tem o modelo pedido, NÃO marca como
    // aberto — marcar aqui faria o link depender de o dado já estar em cache.
    const alvo = templates?.find((template) => template.id === idDoModelo);
    if (!alvo) return;
    setAbertoPelaUrl(true);
    // O link só abre a EDIÇÃO para quem pode editar — a mesma régua da lista.
    // Um agent que recebe o link de um compartilhado fica na lista, onde o
    // modelo está visível: abrir o form ali seria um Salvar que a RLS recusa.
    if (!canModify(alvo)) return;
    setEditing(alvo);
    setFormOpen(true);
  }, [abertoPelaUrl, idDoModelo, templates, canModify]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (template: MessageTemplate) => {
    setEditing(template);
    setFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex sm:justify-end">
        <Button type="button" onClick={openNew} className="w-full sm:w-auto">
          <Plus /> Nova resposta pronta
        </Button>
      </div>
      {!templates?.length ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-base font-semibold">Nenhuma resposta pronta ainda</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            São os textos que a equipe repete todo dia: pedir os dados da demanda, avisar que foi registrada, informar o horário do gabinete.
            Na conversa, a pessoa toca em Respostas prontas, escolhe uma e o nome do cidadão já entra no texto.
          </p>
          {canShare ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <Button type="button" onClick={() => void usarSugeridas()} disabled={criandoSugeridas}>
                {criandoSugeridas ? "Criando…" : "Usar as respostas sugeridas"}
              </Button>
              <p className="text-xs text-muted-foreground">Cria 9 respostas para toda a equipe. Depois você revisa e ajusta cada uma.</p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Peça ao gestor para criar as respostas da equipe, ou crie as suas em Nova resposta pronta.</p>
          )}
          {avisoSugeridas && <p className="mt-3 text-sm" role="status">{avisoSugeridas}</p>}
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((template) => {
            return (
              <li
                key={template.id}
                className="flex items-start justify-between gap-4 rounded-md border bg-card p-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{template.title}</span>
                    <Badge variant={template.owner_user_id ? "neutral" : "default"} style={template.owner_user_id ? undefined : { color: "var(--accent-ink, var(--color-accent))" }}>
                      {t(template.owner_user_id ? "Pessoal" : "Compartilhado")}
                    </Badge>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{template.body}</p>
                </div>
                {canModify(template) && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("Editar template")}
                      onClick={() => openEdit(template)}
                    >
                      <PencilSimple />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("Excluir template")}
                        >
                          <Trash />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("Excluir este template?")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("Essa ação não pode ser desfeita.")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              del.mutate(template.id, {
                                onSuccess: () => toast.success(t("Template excluído.")),
                              })
                            }
                          >
                            {t("Excluir")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        canShare={canShare}
        template={editing}
      />
    </div>
  );
}
