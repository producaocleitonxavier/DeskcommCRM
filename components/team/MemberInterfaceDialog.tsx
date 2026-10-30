"use client";
import { useT } from "@/hooks/i18n/useT";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InterfaceEditor } from "./InterfaceEditor";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import {
  interfaceSettingsSchema,
  interfaceTemDestino,
  lerInterface,
} from "@/lib/navigation/interface";
import { PERFIS_DE_ACESSO } from "@/lib/navigation/perfis";
import type { Role } from "@/lib/auth/types";
import type { TeamMember } from "@/hooks/team/useTeamMembers";
export function MemberInterfaceDialog({
  member,
  onClose,
}: {
  member: TeamMember;
  onClose: () => void;
}) {
  const t = useT();
  const [settings, setSettings] = useState(lerInterface(member.interface_settings).settings);
  const [perfilNota, setPerfilNota] = useState<string | null>(null);
  const qc = useQueryClient();
  const router = useRouter();
  const save = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/v1/team/${member.user_id}/interface`, { interface_settings: settings }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["team"] });
      router.refresh();
      toast.success(t("Interface atualizada."));
      onClose();
    },
    onError: showApiError,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Interface de")} {member.full_name ?? member.email ?? t("membro")}</DialogTitle>
          <DialogDescription>{t("A alteração vale apenas nesta organização e aparece para o membro sem sair da conta.")}</DialogDescription>
        </DialogHeader>
        {lerInterface(member.interface_settings).needsAdjustment && (
          <p role="status">{t("A seleção anterior contém áreas que não existem mais. Confira e salve novamente.")}</p>
        )}

        {/* Perfis prontos: aplicam o MENU típico de cada função. O PODER é o
            Papel, definido na lista de membros — por isso cada perfil mostra o
            papel recomendado. */}
        <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--color-border, #e5e5e5)" }}>
          <p className="text-sm font-medium">{t("Perfis prontos")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Um clique monta o menu típico de cada função. Ajuste abaixo se quiser. Lembre de definir o Papel recomendado na lista de membros — o perfil define o que a pessoa VÊ; o papel define o que ela PODE fazer.")}
          </p>
          <div className="flex flex-wrap gap-2">
            {PERFIS_DE_ACESSO.map((p) => (
              <Button
                key={p.chave}
                type="button"
                variant="outline"
                size="sm"
                disabled={save.isPending}
                onClick={() => {
                  setSettings(p.destinos ? { preset: "completa", destinos: [...p.destinos] } : { preset: "completa" });
                  setPerfilNota(
                    `${t("Menu")} "${p.nome}" ${t("aplicado")}. ${t("Papel recomendado")}: ${p.papelRotulo}. — ${p.descricao}`,
                  );
                }}
              >
                {p.nome}
              </Button>
            ))}
          </div>
          {perfilNota && (
            <p className="text-xs" role="status" style={{ color: "var(--color-text-muted, #666)" }}>
              {perfilNota}
            </p>
          )}
        </div>

        <InterfaceEditor
          value={settings}
          onChange={setSettings}
          role={member.role as Role}
          disabled={save.isPending}
        />
        <Button
          disabled={
            save.isPending ||
            !interfaceSettingsSchema.safeParse(settings).success ||
            !interfaceTemDestino(settings, member.role as Role)
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? t("Salvando…") : t("Salvar interface")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
