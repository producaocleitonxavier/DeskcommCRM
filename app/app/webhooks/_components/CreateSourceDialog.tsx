"use client";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateWebhookSource,
  usePipelines,
  usePipelineStages,
  type WebhookSourceRow,
} from "@/hooks/webhooks/useWebhookSources";
import { useT } from "@/hooks/i18n/useT";
import { palavra, useEhGabinete } from "./gabinete";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (source: WebhookSourceRow) => void;
}

export function CreateSourceDialog({ open, onOpenChange, onCreated }: Props) {
  const t = useT();
  const [name, setName] = React.useState("");
  const [pipelineId, setPipelineId] = React.useState<string>("");
  const [stageId, setStageId] = React.useState<string>("");
  const [redirectTo, setRedirectTo] = React.useState("");

  const { data: pipelinesRes, isLoading: pipelinesLoading } = usePipelines();
  const { data: boardRes, isLoading: stagesLoading } = usePipelineStages(pipelineId || null);
  const create = useCreateWebhookSource();

  const pipelines = pipelinesRes?.data ?? [];
  const stages = boardRes?.data?.stages ?? [];
  const gabinete = useEhGabinete();

  // Gabinete: funil e estágio são peça do motor de vendas que fica por baixo; a tela escolhe
  // sozinha o primeiro de cada, e a pessoa só dá o nome do formulário.
  React.useEffect(() => {
    if (gabinete && open && !pipelineId && pipelines[0]) setPipelineId(pipelines[0].id);
  }, [gabinete, open, pipelineId, pipelines]);
  React.useEffect(() => {
    if (gabinete && open && pipelineId && !stageId && stages[0]) setStageId(stages[0].id);
  }, [gabinete, open, pipelineId, stageId, stages]);

  React.useEffect(() => {
    if (!open) {
      setName("");
      setPipelineId("");
      setStageId("");
      setRedirectTo("");
    }
  }, [open]);

  React.useEffect(() => {
    setStageId("");
  }, [pipelineId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipelineId || !stageId) {
      toast.error(gabinete ? "Ainda estou preparando a entrada. Espere um instante e tente de novo." : t("Escolha o funil e o estágio de entrada."));
      return;
    }
    try {
      const res = await create.mutateAsync({
        name,
        default_pipeline_id: pipelineId,
        default_stage_id: stageId,
        redirect_to: redirectTo.trim() || undefined,
      });
      toast.success(gabinete ? "Formulário criado. Agora é só ligar ao seu site." : t("Fonte criada. Agora é só conectar seu site."));
      onOpenChange(false);
      onCreated(res.data);
    } catch {
      /* erro já mostrado pelo showApiError */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{gabinete ? "Novo formulário do site" : t("Nova fonte de captação")}</DialogTitle>
          <DialogDescription>
            {gabinete
              ? "Dê um nome para reconhecer de onde veio. Cada pessoa que preencher o formulário entra em Pessoas, como Novo contato."
              : t("Dê um nome e diga em qual funil o contato deve entrar quando alguém preencher seu formulário.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="src-name">{t("Nome")}</Label>
            <Input
              id="src-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={palavra(gabinete, t("Landing page de Black Friday"), "Ex.: Abaixo-assinado do bairro")}
              minLength={1}
              maxLength={120}
              required
            />
          </div>
          {gabinete ? null : (
          <>
          <div className="space-y-2">
            <Label>{t("Funil de entrada")}</Label>
            <Select value={pipelineId} onValueChange={setPipelineId} disabled={pipelinesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={t("Escolha o funil")} />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("Estágio de entrada")}</Label>
            <Select
              value={stageId}
              onValueChange={setStageId}
              disabled={!pipelineId || stagesLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={pipelineId ? t("Escolha o estágio") : t("Escolha o funil primeiro")}
                />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </>
          )}
          <div className="space-y-2">
            <Label htmlFor="src-redirect">{t("URL de obrigado (opcional)")}</Label>
            <Input
              id="src-redirect"
              type="url"
              value={redirectTo}
              onChange={(e) => setRedirectTo(e.target.value)}
              placeholder="https://seusite.com.br/obrigado"
            />
            <p className="text-xs text-muted-foreground">
              {t("Para onde enviar a pessoa depois que ela preencher seu formulário.")}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={create.isPending || (gabinete && (!pipelineId || !stageId))}>
              {gabinete ? "Criar formulário" : t("Criar fonte")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
