<div align="center">

<img src="ranga/branding/icon.svg" width="112" alt="Ranga">

# Ranga

**Um navegador pessoal pra Linux, com barra lateral, espaços e cara de desktop.**

Feito sobre o [Helium](https://github.com/imputnet/helium) (Chromium sem Google), com a barra lateral no estilo do Arc, Material 3 e as cores do tema do sistema.

![versão](https://img.shields.io/badge/versão-0.5.7-7cc2a8?style=flat-square)
![Chromium](https://img.shields.io/badge/Chromium-156-4c8bf5?style=flat-square)
![Linux](https://img.shields.io/badge/Linux-x86__64-e0a64b?style=flat-square)
![licença](https://img.shields.io/badge/licença-GPL--3.0-b07ce8?style=flat-square)

<img src="ranga/docs/img/hero.webp" alt="Ranga com a barra lateral aberta: espaço Pessoal, fixadas, favoritos e abas de hoje ao lado da página" width="100%">

</div>

> [!NOTE]
> O Ranga ainda está em desenvolvimento (0.x). Uso diário, mas pensado pra minha máquina (Omarchy + Hyprland); em outro Linux deve funcionar, sem garantia.

## Por que o Ranga

O Chromium guarda abas numa faixa no topo, configurações em dois lugares e trata a janela como moldura. O Ranga troca isso por uma barra lateral que organiza o dia: **espaços** pra separar trabalho e vida, **fixadas** pros sites de sempre, **hoje** pras abas que vêm e vão (e que se arquivam sozinhas). A página vira um cartão e o resto sai do caminho.

<table>
<tr>
<td width="33%" valign="top"><img src="ranga/docs/img/sidebar.webp" alt="Barra lateral do Ranga"></td>
<td valign="top">

### A barra lateral

- **Espaços** com ícone, cor e sessão própria: cada espaço tem seus logins e cookies. Ctrl+Shift+← / → ou rolar de lado troca de espaço; cada um lembra a última aba, e fechar uma aba fica no mesmo espaço.
- **Apps por espaço**: "Instalar como app" instala o PWA no espaço em que você está, com a conta dele e a própria entrada no menu de apps ("App — Espaço"). O mesmo app pode ficar em dois espaços, um com cada conta, sem outro perfil.
- **Fixadas** em grade de cartões, com pastas. Um link aberto de uma fixada aparece num **Peek** por cima da página.
- **Hoje**: as abas do dia. Paradas dormem (sem perder fixada, espaço nem nome) e as esquecidas há 2 dias são arquivadas, com Desfazer.
- **Favoritos**, downloads com anel de progresso, extensões fixadas e o endereço da aba atual.
- Renomear abas com duplo clique, Ctrl/Shift+clique pra marcar várias e fechar, mover ou fixar todas de uma vez.

</td>
</tr>
</table>

## Destaques

<table>
<tr>
<td width="50%" valign="top">

**Spotlight**

Ctrl+T e Ctrl+L abrem uma busca única: no topo a busca, o site que você já visita completado e as sugestões do buscador; embaixo, Abas, Favoritos e Histórico em seções. Aliases como `a`, `f`, `h` e `yt` restringem a busca, e a aba só nasce quando você escolhe um resultado.

<img src="ranga/docs/img/spotlight.webp" alt="Spotlight buscando 'lobo'">

</td>
<td width="50%" valign="top">

**Barra que recolhe com mola**

Ctrl+Shift+S recolhe a barra e a página ocupa a janela. Deixar o mouse meio segundo na borda traz a barra de volta com efeito de mola, empurrando a página; só passar pela borda a caminho de outro programa não abre.

<img src="ranga/docs/img/collapsed.webp" alt="Página ocupando a janela inteira com a barra lateral recolhida">

</td>
</tr>
<tr>
<td width="50%" valign="top">

**Cobrinha de carregamento**

Enquanto a página carrega, um traço na cor do tema corre pela borda do cartão e fecha a volta quando termina.

<img src="ranga/docs/img/loading.webp" alt="Cobrinha de carregamento contornando o cartão da página">

</td>
<td width="50%" valign="top">

**Várias abas de uma vez**

Ctrl+clique e Shift+clique marcam abas; o menu vale pra todas: fechar, mover de espaço, guardar num grupo, fixar, copiar os links.

<img src="ranga/docs/img/multiselect.webp" alt="Três abas marcadas e o menu de ações em lote">

</td>
</tr>
</table>

**Configurações num lugar só.** As opções do Ranga e as do Chromium que fazem sentido estão na mesma página, com busca e navegação. As telas grandes (senhas, permissões de cada site) abrem a página do Chromium e voltam com Esc.

<img src="ranga/docs/img/settings.webp" alt="Página de configurações do Ranga na seção Privacidade e segurança" width="100%">

## Também

- **Sincronização entre aparelhos** (opcional): favoritos, histórico, extensões, grupos e os espaços que você escolher, mais as abas abertas dos outros aparelhos num botão da barra e no Spotlight, e "Enviar para" no menu da aba. Tudo é cifrado no navegador e guardado numa pasta escondida do seu próprio Google Drive; sem a chave de recuperação, ninguém lê. Senhas ficam no 1Password.
- **Privacidade do Helium**: sem serviços do Google, uBlock Origin embutido, ruído contra fingerprinting, Global Privacy Control e só HTTPS.
- **Abas divididas**: arraste uma aba da barra pra cima da página pra dividir à esquerda, à direita, em cima ou embaixo, abrir em nova janela ou levar pra outra janela do Ranga. Cada metade tem botões pra arrastar, separar e fechar.
- **Grupos**: abas salvas num grupo recolhível na barra, com nome e ícone, que voltam ao reabrir.
- **Mini player**: o que toca em outra aba aparece no pé da barra, com tocar/pausar, próxima e picture-in-picture.
- **Nova aba** com saudação, tempo da sua cidade, atalhos, tarefas e notícias.
- **Avisos num cartão no pé da página**: link copiado, abas fechadas e arquivadas com Desfazer, aba recebida, download concluído. Aparecem com a barra recolhida e nos apps.
- **Tradução do navegador sem o Chrome**: o Ranga baixa o tradutor do Chrome e a API `Translator` funciona em todos os espaços (as legendas traduzidas do Teams, por exemplo).
- **Tema do sistema**: segue as cores do Ciel (o shell do meu desktop) e a transparência do material, no claro e no escuro.
- **Janela pequena**: links vindos de outros apps abrem numa janela compacta; "Abrir no Ranga" leva pra janela principal.
- **Volta de onde parou**: abas, espaços e nomes de aba voltam ao reabrir, até depois de uma falha.
- **Atalhos configuráveis**, procurar na página num cartão, zoom em chip no endereço, informações do site pelo cadeado, captura de tela, QR code.
- **Funciona com o 1Password**, Widevine (streaming) e PWAs.

## Atalhos

| Atalho | O que faz |
|---|---|
| Ctrl+T | Spotlight pra nova aba |
| Ctrl+N / Ctrl+Shift+N | Janela nova / anônima, já com o Spotlight aberto |
| Ctrl+L | Buscar ou trocar o endereço da aba |
| Ctrl+Shift+S | Recolher ou fixar a barra lateral |
| Ctrl+Shift+← / → | Espaço anterior / próximo |
| Ctrl+D | Fixar ou desafixar a aba |
| Ctrl+Shift+D | Dividir a tela com a aba anterior |
| Ctrl+Shift+C | Copiar o link da aba |
| Ctrl+Tab | Abas recentes |
| Ctrl+, | Configurações |

Todos (menos Ctrl+Tab) mudam em Configurações → Atalhos.

Novidades de cada versão no [CHANGELOG](CHANGELOG.md).

## Instalar

Precisa de Linux x86_64, `zstd` e `pkexec` (polkit). Baixe a [release mais nova](https://github.com/taigakilla/ranga/releases/latest) e rode o instalador:

```bash
curl -s https://api.github.com/repos/taigakilla/ranga/releases/latest \
  | grep -o 'https://[^"]*x86_64\.tar\.zst' | head -1 | xargs curl -LO
tar -I zstd -xf ranga-*-x86_64.tar.zst
ranga-*-x86_64/install.sh
```

O Ranga vai pra `/opt/ranga` (do root, como o 1Password pede) e ganha o comando `ranga`, o atalho no menu de apps e o `ranga-update`.

**Atualizar:** `ranga-update`, ou `ciel update` com o Ciel. A versão nova é instalada ao lado da aberta e a barra lateral avisa *Atualização instalada · Reiniciar*.

## Compilar

O Ranga é um conjunto de patches sobre o Helium (`patches/ranga/`) e a barra lateral como extensão de componente (`ranga/sidebar/`). Build, sandbox de testes, pacote e releases estão em [`ranga/README.md`](ranga/README.md).

## Créditos

- [Helium](https://github.com/imputnet/helium) e [helium-linux](https://github.com/imputnet/helium-linux), da imput, de onde este repositório é um fork.
- [ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium) e o [Chromium](https://www.chromium.org/).
- O nome e o lobo de chifre e estrela vêm do Ranga, de *Tensei Shitara Slime Datta Ken*.

Licença GPL-3.0, como o Helium. Ver [LICENSE](LICENSE) e [LICENSE.ungoogled_chromium](LICENSE.ungoogled_chromium).
