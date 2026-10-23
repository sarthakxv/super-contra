import { ACTIONS, settings, defaultSettings, saveSettings, keyLabel, bindingError } from "./settings.js";
import { CHARACTERS, characterSprite } from "./characters.js";
import { assets } from "./assets.js";
import { Animator } from "./anim.js";

export function initCustomization({ onOpen, onClose }) {
  const dialog = document.getElementById("customize");
  const controls = document.getElementById("control-bindings");
  const roster = document.getElementById("character-roster");
  const status = document.getElementById("customize-status");
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  const playerButtons = [...dialog.querySelectorAll("[data-player]")];
  let draft, player = 0, capture = null, previousFocus, tab = "controls";
  const body = new Animator("Controller Body"), legs = new Animator("Controller Legs");
  body.play("Run"); legs.play("Run");

  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function cancelCapture() {
    if (!capture) return;
    capture = null; renderControls();
  }

  function renderControls() {
    controls.replaceChildren();
    for (const [index, [action, label]] of Object.entries(ACTIONS).entries()) {
      const row = document.createElement("div"); row.className = "binding-row";
      const number = document.createElement("span"); number.className = "binding-number";
      number.textContent = String(index + 1).padStart(2, "0"); number.setAttribute("aria-hidden", "true");
      const name = document.createElement("span"); name.textContent = action === "b" ? "Shoot" : action === "down" ? "Duck/down" : label;
      const button = document.createElement("button"); button.type = "button";
      button.className = "key-binding";
      button.textContent = capture === action ? "Press a key…" : keyLabel(draft.bindings[player][action]);
      button.setAttribute("aria-label", `Player ${player + 1}: ${label}, ${button.textContent}. Change binding`);
      button.setAttribute("aria-describedby", "customize-status");
      button.setAttribute("aria-pressed", String(capture === action)); button.dataset.action = action;
      button.addEventListener("click", () => {
        capture = action; renderControls();
        controls.querySelector(`[data-action="${action}"]`).focus();
        message(`Press a key for ${label}. Escape cancels.`);
      });
      row.append(number, name, button); controls.append(row);
    }
  }

  function renderRoster() {
    for (const button of playerButtons) {
      button.querySelector(".player-character").textContent = CHARACTERS.find((character) => character.id === draft.characters[Number(button.dataset.player)]).name;
    }
    roster.replaceChildren();
    for (const character of CHARACTERS) {
      const card = document.createElement("button"); card.type = "button"; card.className = "character-card";
      card.dataset.character = character.id;
      card.setAttribute("aria-pressed", String(draft.characters[player] === character.id));
      card.setAttribute("aria-label", `${character.name}. ${character.detail}`);
      const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
      canvas.setAttribute("aria-hidden", "true");
      const name = document.createElement("strong"); name.textContent = character.name;
      const detail = document.createElement("span"); detail.className = "character-detail"; detail.textContent = character.detail;
      const selected = document.createElement("span"); selected.className = "character-selection";
      selected.textContent = draft.characters[player] === character.id ? "Ready" : "Select";
      card.append(canvas, name, detail, selected);
      card.addEventListener("click", () => {
        draft.characters[player] = character.id; renderRoster();
        roster.querySelector(`[data-character="${character.id}"]`).focus();
        message(`${character.name} selected for Player ${player + 1}. Save to keep your choice.`); draw(0);
      });
      roster.append(card);
    }
  }

  function selectTab(next) {
    cancelCapture(); tab = next;
    for (const button of tabs) {
      const selected = button.dataset.tab === tab;
      button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
      document.getElementById(button.getAttribute("aria-controls")).hidden = !selected;
    }
    message(""); draw(0);
  }
  for (const button of tabs) {
    button.addEventListener("click", () => selectTab(button.dataset.tab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.code)) return;
      event.preventDefault();
      const next = event.code === "Home" ? tabs[0] : event.code === "End" ? tabs.at(-1) : tabs[(tabs.indexOf(button) + 1) % tabs.length];
      selectTab(next.dataset.tab); next.focus();
    });
  }
  for (const button of playerButtons) {
    button.addEventListener("click", () => {
      cancelCapture(); player = Number(button.dataset.player);
      for (const item of playerButtons) item.setAttribute("aria-pressed", String(item === button));
      document.getElementById("player-caption").textContent = `Editing Player ${player + 1}`;
      renderControls(); renderRoster(); message(""); draw(0);
    });
  }
  dialog.addEventListener("keydown", (event) => {
    if (!capture) {
      if (event.code === "Tab") {
        const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]')]
          .filter((element) => element.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return;
    const action = capture;
    if (event.code === "Escape") {
      cancelCapture(); message("Binding unchanged.");
      controls.querySelector(`[data-action="${action}"]`).focus(); return;
    }
    const isShift = event.code === "ShiftLeft" || event.code === "ShiftRight";
    const error = event.ctrlKey || event.metaKey || event.altKey || (event.shiftKey && !isShift)
      ? "Use one key at a time. Left / Right Shift can be assigned on their own; key combinations are unsupported."
      : bindingError(draft.bindings, player, action, event.code);
    if (error) { message(error, true); return; }
    draft.bindings[player][action] = event.code;
    capture = null; renderControls();
    controls.querySelector(`[data-action="${action}"]`).focus();
    message(`${ACTIONS[action]} assigned to ${keyLabel(event.code)}. Save to apply.`);
  }, { capture: true });

  function close(save) {
    cancelCapture();
    const persisted = save ? saveSettings(draft) : true;
    dialog.close(); onClose({ saved: save, persisted });
    if (!save && previousFocus?.isConnected && !previousFocus.hidden) previousFocus.focus();
    else document.getElementById("screen").focus();
  }
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(false); });
  document.getElementById("customize-cancel").addEventListener("click", () => close(false));
  document.getElementById("customize-save").addEventListener("click", () => close(true));
  document.getElementById("customize-reset").addEventListener("click", () => {
    cancelCapture();
    if (tab === "controls") draft.bindings = defaultSettings().bindings;
    else draft.characters = defaultSettings().characters;
    renderControls(); renderRoster(); draw(0);
    message(`${tab === "controls" ? "Both players’ keyboard bindings" : "Both characters"} reset. Save to apply.`);
  });

  function draw(dt) {
    if (!dialog.open || tab !== "characters") return;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) { body.update(dt); legs.update(dt); }
    for (const card of roster.children) {
      const canvas = card.querySelector("canvas"), ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (player === 1 && card.dataset.character === "commando") ctx.filter = "hue-rotate(140deg)";
      for (const [frame, offset] of [[legs.sprite, 0], [body.sprite, 19]]) {
        if (!frame) continue;
        const s = assets.sprites[characterSprite(card.dataset.character, frame, player === 1)];
        ctx.drawImage(assets.images[s.tex], s.x, s.y, s.w, s.h, Math.round(30 - s.px), Math.round(56 - offset - s.py), s.w, s.h);
      }
      ctx.filter = "none";
    }
  }

  return {
    get open() { return dialog.open; }, draw,
    show(inGame) {
      if (dialog.open) return;
      previousFocus = document.activeElement;
      draft = structuredClone(settings); capture = null;
      document.getElementById("character-notice").textContent = inGame
        ? "Characters change next run. Keys change on resume."
        : "Choose your fighter";
      onOpen(); renderControls(); renderRoster(); selectTab(tab);
      dialog.showModal(); draw(0);
      tabs.find((button) => button.dataset.tab === tab).focus();
    },
  };
}
