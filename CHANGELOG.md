# Changelog

## 0.5.2 — 31/10/2026
- **Arrastar texto pra barra de abas** abre uma janela nova pesquisando o texto; arrastar um link abre o link numa janela nova.
- **Apps (PWA) como o WhatsApp não fecham mais sozinhos**: dormir e arquivar abas paradas só vale pras janelas normais.
- **Português como idioma principal** dos sites por padrão (uma vez, em perfis com inglês na frente). Resolve preços como "R$ 3519.00" no lugar de "R$ 35,19" em extensões que leem o número no formato do idioma.
- A opção **Idioma principal** agora fica gravada depois de reabrir o Ranga.

## 0.5.1 — 31/10/2026
- Menu da aba mais simples: **Mover para ›** (espaços e grupos) e **Enviar para ›** (outros aparelhos) abrem um segundo menu ao lado, no lugar das seções com título.

## 0.5.0 — 31/10/2026

### Sincronização entre aparelhos
- Opcional, em Configurações → Sincronização: entra com uma conta Google e guarda tudo cifrado (AES-GCM) numa pasta escondida do seu Google Drive. Sem conectar, nada muda e nada aparece.
- Chave de recuperação criada no primeiro aparelho; os outros entram com ela. Sem a chave, nem o Google nem o Ranga leem os dados.
- **Favoritos** iguais em todos os aparelhos (criar, renomear, mover, reordenar, apagar). Na primeira vez, junta os dos dois lados sem apagar nada e guarda uma cópia antes.
- **Abas de outros aparelhos**: botão no canto inferior direito da barra e seção no Spotlight.
- **Enviar para** outro aparelho no menu da aba: abre lá em segundo plano, com aviso.
- **Histórico** dos outros aparelhos no Spotlight.
- **Extensões**: as que estão nos outros aparelhos aparecem em Configurações → Extensões com "Instalar".
- **Grupos** sincronizados e **espaços** um a um ("Sincronizar espaço" no menu do espaço).
- Cada tipo liga e desliga nas configurações; o nome do aparelho vem do nome da máquina e dá pra trocar.

### Também
- Reiniciar depois de uma atualização relança pelo lançador e abre a versão nova.
- Arrastar uma aba pras Fixadas vazias mostra o alvo.

## 0.4.0 — 28/10/2026
- Espaços com sessão própria (logins e cookies por espaço).
- Spotlight em seções (Abas, Favoritos, Histórico), sugestões do buscador e aliases.
- Abas divididas: arrastar a aba pra cima da página divide a tela.
- Grupos recolhíveis na barra, mini player e picture-in-picture automático, nova aba com tempo, tarefas e notícias.
- Barra recolhida que acorda pelo teclado, seta de voltar, busca própria na janela anônima, testes do navegador de verdade e atualizador mais seguro.

## 0.3.0 — 26/10/2026
- Primeira versão instalável: marca própria (nome, ícone do lobo, traduções), pacote em `/opt/ranga`, releases automáticas e `ranga-update`.
- Barra lateral estilo Arc com Kurobe: espaços, fixadas, hoje, favoritos, downloads e extensões.
- Configurações unificadas, barra recolhível com mola, Peek, janela pequena e atalhos configuráveis.
