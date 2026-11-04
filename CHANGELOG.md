# Changelog

## 0.5.5 — 04/11/2026
- **Cada espaço com a própria conta de verdade**: abas que nasciam fora da barra (Ctrl+T, link vindo de outro app, a aba vazia ao entrar num espaço sem abas) caíam na sessão principal mesmo num espaço com sessão própria, e o login aparecia nos dois espaços. Agora o navegador sabe o espaço ativo de cada janela e essas abas já nascem no container dele, sem recarregar. Links abertos de um app ou aba da sessão principal continuam na sessão principal, no espaço Pessoal.
- **Apps por espaço**: "Instalar como app" num espaço com conta própria instala o app só nele. O app abre no container do espaço, com os cookies e logins dele, e ganha a própria entrada no menu de apps ("<app> — <espaço>"), que acompanha o nome se o espaço for renomeado. O mesmo app (o Teams, por exemplo) pode ser instalado em dois espaços, um com cada conta, sem outro perfil. As janelas de cada espaço têm a classe `chrome-<app>-<perfil>-<container>` e não se misturam, e links abertos de dentro do app caem no espaço dele. Desinstalar pelo menu do app tira ele só daquele espaço quando ele também está em outro.
- **Containers voltam certos ao reabrir o Ranga**: a sessão guarda o container de cada aba, então as abas dos espaços e os apps de cada espaço reabrem direto no container deles, com a conta certa, sem recarregar.
- **Fechar uma aba não troca de espaço**: ao fechar a aba ativa, o Ranga ia pra aba que o Chromium escolhesse, às vezes de outro espaço, e o espaço trocava junto. Agora o próprio navegador escolhe a aba usada por último no mesmo espaço (ou abre uma nova, se era a última), sem piscar.
- **Downloads dentro dos apps**: um download começado num PWA mostra o aviso do Ranga na própria janela do app (o nome do arquivo enquanto baixa, "Download concluído" com Abrir, ou a falha). Antes não aparecia nada, porque a janela do app não tem a barra lateral.
- **Sem a tela "Quem está usando o Ranga?" ao abrir**: com mais de um perfil, o Ranga abre direto no último perfil usado.
- **Widevine sem o Chrome**: cada instalação leva uma cópia do Widevine (a do Chrome, ou a da versão atual quando o Chrome não está instalado), então vídeo com DRM continua tocando depois de desinstalar o Chrome.

## 0.5.4 — 04/11/2026
- **Download começando**: um ícone de arquivo cai com mola no botão de downloads. Com a barra recolhida, ela espia um instante e recolhe sozinha.
- **Avisos de download sem o nome espremido**: ao terminar, só "Download concluído" com Abrir.
- **Mini player com capa**: a capa da mídia (thumbnail do YouTube, capa de música) aparece grande no topo, com o fundo na cor dela. Minimizar e fechar ficam no canto.
- **PiP do mini player** abre e fecha (antes não fazia nada quando o vídeo já estava em PiP, como depois do PiP automático) e fica aceso enquanto aberto.
- **Ícone do Ranga nos controles de mídia do sistema** (MPRIS) no lugar do ícone do Chromium.
- **Barra de progresso ondulada do shell no mini player**: a onda ocupa só o que já tocou, afina nas pontas e achata quando pausa. Tem marcador em pílula, e arrastar busca a posição.
- **Mini player minimizado**: o botão de minimizar deixa ele numa linha só, com o nome do que toca e os controles (tocar e próxima), e uma linha fina de progresso embaixo. Fica lembrado.
- **Ao vivo no mini player**: transmissões ao vivo (live do YouTube, jogo na HBO Max) mostram "Ao vivo" no lugar do tempo. Atrás do ao vivo, ele mostra quanto e um toque volta pra ponta.
- **Mini player com duas mídias**: pausar a que está no player não troca mais pela outra que já tocava. Só troca quando outra começa a tocar.
- **Mini player sem capa**: o nome ganha a linha toda. Mudo e PiP desceram pra linha dos controles, e ir para a aba é clicar no nome ou na capa.

## 0.5.3 — 01/11/2026
- **Configurações → Extensões**: cada extensão ganha um alfinete (fixar na barra lateral) e um botão que liga e desliga a extensão de verdade. Antes o botão só fixava, e parecia que desligava as extensões.
- **Nova aba pelo spotlight**: comando "Nova aba"; digitar `nt` e Enter abre uma direto.
- **Ctrl+W na última aba não fecha mais o Ranga**: abre uma nova aba no lugar. A janela fecha com Super+Q (ou Ctrl+Shift+W). Janela anônima fecha como antes.

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
