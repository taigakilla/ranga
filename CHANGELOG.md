# Changelog

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
