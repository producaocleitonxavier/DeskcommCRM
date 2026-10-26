-- manifest: 9054 — Confirmação de nome no cadastro por QR (pol_qr_cadastros). Fluxo de dois passos: a pessoa manda a mensagem do QR, a gente PEDE nome e sobrenome (garante o nome mesmo de quem não tem no WhatsApp), e só então entrega o material. `aguardando_nome` marca quem já pediu e espera; `nome_informado` guarda o que a pessoa respondeu. Aditivo, faixa 9000+ do fork.

alter table public.pol_qr_cadastros add column if not exists aguardando_nome boolean not null default false;
alter table public.pol_qr_cadastros add column if not exists nome_informado text;

-- O passo 2 (chega a resposta com o nome) procura, a cada inbound, um cadastro
-- deste contato aguardando nome. Índice parcial pra essa busca ser barata.
create index if not exists idx_pol_qr_cadastros_aguardando
  on public.pol_qr_cadastros(organization_id, contact_id)
  where aguardando_nome;

notify pgrst, 'reload schema';
