# Ranga

Fork pessoal do [helium-linux](https://github.com/imputnet/helium-linux) com interface própria.

- Patches: `patches/ranga/`, listados no fim de `patches/series`.
- Código nosso: `ranga/`.
- CI: `.github/workflows/ranga-*.yml`.
- Plano: Obsidian `pessoal/dev/ranga/`.

Upstream é o remote `helium`. Atualizar: workflow `Ranga sync`.

ID da extensão sidebar: `hncljkmljckjojdjincglklbdihcaeko`

## Desenvolvimento

- Abrir o Ranga de desenvolvimento: `ranga/bin/ranga-run [url...]`.
- Testar sem mexer na tela: `ranga/bin/ranga-sandbox up | open [url...] | key <tecla> [mod...] | eval <js> [pagina] | shot <png> | theme <id> | down` (usa o `ciel-sandbox`). `RANGA_EXTRA_EXTENSIONS=<pasta>[,<pasta>]` carrega extensões a mais no `open` (ex.: uma extensão de teste com popup); `RANGA_FIRST_RUN=1` abre sem `--no-first-run`, pra testar o onboarding.
- Testes do navegador de verdade: `ranga/bin/ranga-e2e` sobe o sandbox, abre o `out/Release/ranga` (`RANGA_BINARY` troca) e roda `ranga/e2e/e2e.mjs` pelo CDP: API da barra, Alt+← com a seta, recolher pelo atalho, barra acordada quando recolhida, tela cheia do vídeo e do F11 com o Esc, arrastar aba pra dividir e o buscador da janela anônima. Fecha as outras abas do perfil do sandbox. Leva uns dois minutos.
- Conferir os patches contra o Chromium original da versão: `python3 helium-chromium/devutils/update_platform_patches.py merge patches`, `python3 ranga/ci/check_patches.py patches/series.merged patches helium-chromium/chromium_version.txt` e `... unmerge patches`. Baixa os arquivos do `googlesource` com nova tentativa no 429/5xx e guarda em `~/.cache/ranga/chromium/<versão>`.
- A barra lateral é uma extensão de componente (patch `ranga/ui/sidebar-component.patch`): o navegador carrega de `--ranga-sidebar-dir=<pasta>` (os scripts passam `ranga/sidebar`) ou, sem a opção, de `<pasta do binário>/resources/ranga-sidebar`. Não aparece em `chrome://extensions` e não pode ser desligada. Mudou JS/CSS/HTML: basta reabrir o navegador (ou recarregar a página da barra), sem build. Mudou o `background.js` ou um módulo que ele importa (`*-model.js`): suba a `version` do `manifest.json`, senão o Chromium continua com o service worker antigo em cache.
- 1Password: o app de desktop só conversa com navegadores listados em `/etc/1password/custom_allowed_browsers` (uma linha por nome de processo: `helium` hoje, `ranga` depois do branding). O `ranga-run` copia o manifesto `com.1password.1password.json` pro `NativeMessagingHosts/` do perfil. Depois de mexer na lista, feche e reabra o 1Password.

## Instalável

- Compilar a release: `out/Release` (sem component build, sem DCHECK, `symbol_level=0`).
- Empacotar: `ranga/bin/ranga-package [OutDir]` gera `build/release/ranga-<versão>-x86_64.tar.zst` (binário sem símbolos, `resources/ranga-sidebar/`, host do tema, ícones, `.desktop`, `install.sh`). O pacote acrescenta à `version` do manifest da barra um quarto número tirado do conteúdo dela, então todo pacote com a barra mudada troca o service worker.
- Instalar: extrair e rodar `./install.sh`. Cada build vai pra `/opt/ranga/<versão>-<commit>` e o link `current` passa pra ela de uma vez, como root via `pkexec`: o 1Password só conecta com navegador cujo binário é do root. Dá pra instalar com o Ranga aberto: a pasta em uso não é tocada, e as que ninguém usa são apagadas. Liga o `WidevineCdm` do Chrome se existir, lançador e `ranga-update` em `~/.local/bin`, atalho e ícones em `~/.local/share`, hosts nativos (tema do Ciel e 1Password) em `~/.config/ranga/NativeMessagingHosts`, gancho de tema do Ciel.
- `BUILD` no pacote e em `/opt/ranga/current/BUILD`: o commit (10 caracteres), com `-dirty` se havia mudança não commitada.
- Perfil: na primeira vez que o Ranga instalado abre, o lançador copia o perfil de desenvolvimento (`~/.local/share/ranga/dev-profile`) pra `~/.config/ranga` (sem caches); se o Ranga de desenvolvimento estiver aberto, avisa e não abre. `RANGA_MIGRATE=0 ranga` começa do zero.
- O lançador exporta `LANGUAGE=pt_BR` (`RANGA_LANGUAGE` troca), `CHROME_WRAPPER` e `LD_LIBRARY_PATH`, como o wrapper do Helium.

## Releases e atualização

- Publicar: mandar a `main` pro `origin` dispara o hook `ranga/git-hooks/pre-push` (ligado com `git config core.hooksPath ranga/git-hooks`). Ele abre `ranga/bin/ranga-release <commit>` numa unidade do systemd do usuário, que espera o commit chegar no GitHub, compila o Release, roda os testes da barra, empacota e cria a release `build-<commit>` em `taigakilla/ranga` com o `.tar.zst` e o `.sha256`. Recusa se a árvore tiver mudança não commitada. Avisa por notificação; log em `journalctl --user -u ranga-release-<commit>`.
- Atualizar: `ranga-update --check` diz se a release mais nova está à frente do commit instalado (compare do GitHub); `ranga-update` baixa, confere o sha256 e roda o `install.sh` dela. Build local de commit que o GitHub não conhece, ou `-dirty` do mesmo commit, fica como está. O `ciel update` usa isso como a fonte "Ranga".
- Com o Ranga aberto, a barra lateral pergunta ao host nativo se o binário em uso ainda é o `current`; se não for, mostra "Atualização instalada · Reiniciar" (reinicia com as abas, `rangaPrivate.executeCommand(window, "restart")`).
