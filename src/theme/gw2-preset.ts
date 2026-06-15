import {definePreset} from "@primeuix/themes";
import Lara from "@primeuix/themes/lara";

/**
 * GW2 in-game UI preset. darkModeSelector is false, so only the `light`
 * colorScheme is emitted — the surface ramp is intentionally INVERTED
 * (0 = near-black, 950 = light tan) so Lara's light-scheme token wiring
 * (bg = surface.0, text = surface.700) produces dark-bg / gold-text.
 */
export const GW2Preset = definePreset(Lara, {
  primitive: {
    // Sharp GW2 corners — every Lara radius resolves through these.
    borderRadius: {none: "0", xs: "1px", sm: "2px", md: "2px", lg: "2px", xl: "2px"},
    // Severity ramps re-anchored on WvW team colors (step 500 = exact hex).
    // green -> p-button-success, red -> danger, sky -> info.
    green: {50: "#f0fbf4", 100: "#d9f6e3", 200: "#b4edc6", 300: "#8ee3aa", 400: "#69d98d",
            500: "#43D071", 600: "#3cbb66", 700: "#329c55", 800: "#287d44", 900: "#1e5e33", 950: "#143e22"},
    red:   {50: "#fcefef", 100: "#f8d7d7", 200: "#f1b0b0", 300: "#ea8888", 400: "#e36161",
            500: "#DC3939", 600: "#c63333", 700: "#a52b2b", 800: "#842222", 900: "#631a1a", 950: "#421111"},
    sky:   {50: "#edf7fd", 100: "#d3ecfa", 200: "#a7daf5", 300: "#7cc7f1", 400: "#50b5ec",
            500: "#24A2E7", 600: "#2092d0", 700: "#1b7aad", 800: "#16618b", 900: "#104968", 950: "#0b3145"},
  },
  semantic: {
    // Gold ramp; exact GW2 hexes pinned: 200 = hover light, 400 = chrome gold, 500 = .mists-score gold.
    primary: {50: "#fff9ed", 100: "#fff3da", 200: "#ffe2a8", 300: "#ffd78f", 400: "#ffcc77",
              500: "#ffcc66", 600: "#e6b04d", 700: "#bf8f3a", 800: "#99702b", 900: "#73521e", 950: "#4d3413"},
    overlay: {
      select:  {borderRadius: "{border.radius.sm}", shadow: "0 2px 12px 0 rgba(0, 0, 0, 0.6)"},
      popover: {borderRadius: "{border.radius.sm}", shadow: "0 2px 8px rgba(0, 0, 0, 0.6)"},
      modal:   {borderRadius: "{border.radius.sm}", padding: "1.25rem", shadow: "0 2px 12px rgba(0, 0, 0, 0.6)"},
    },
    colorScheme: {
      light: {
        // INVERTED surface ramp. Pinned: 0 = #0a0a0a panel black, 50 = #111 border,
        // 500/600/700 = the three muted golds (#c9b783 / #d8c89a / #e8d5a9).
        surface: {0: "#0a0a0a", 50: "#111111", 100: "#1c1a15", 200: "#2b2719", 300: "#3d3626",
                  400: "#837457", 500: "#c9b783", 600: "#d8c89a", 700: "#e8d5a9",
                  800: "#f3e3c0", 900: "#faf0d8", 950: "#fdf8ec"},
        primary: {
          color: "{primary.400}",        // #ffcc77
          contrastColor: "{surface.0}",  // dark text on gold (Lara hardcodes #fff)
          hoverColor: "{primary.200}",   // #ffe2a8 — GW2 hovers go LIGHTER
          activeColor: "#ffb71a",        // bright gold pressed
        },
        // Lara highlight = {primary.50}/{primary.100} cream — wrong on dark.
        // Exact GW2 hover/active washes from chrome CSS:
        highlight: {
          background: "rgba(255, 204, 119, 0.15)",
          focusBackground: "rgba(255, 204, 119, 0.24)",
          color: "{primary.400}",
          focusColor: "{primary.200}",
        },
        focusRing: {shadow: "0 0 0 0.2rem rgba(255, 204, 119, 0.35)"},
        mask: {background: "rgba(0, 0, 0, 0.55)", color: "{surface.700}"},
        // formField.* needs NO override — inversion makes bg={surface.0},
        // color={surface.700}=#e8d5a9, placeholder={surface.500}=#c9b783 all correct.
        overlay: {
          select:  {background: "rgba(10, 10, 10, 0.96)", borderColor: "{surface.50}"},
          popover: {background: "rgba(10, 10, 10, 0.96)", borderColor: "{surface.50}"},
          modal:   {background: "rgba(10, 10, 10, 0.92)", borderColor: "{surface.50}"},
        },
        list: {option: {focusBackground: "rgba(255, 204, 119, 0.08)"}},
      },
    },
  },
  components: {
    // Lara light tooltip bg = {surface.700} -> would invert to tan. Force dark+gold.
    // Applies to bare pTooltip only; parchment `.tooltip` styleClass rules still win.
    tooltip: {colorScheme: {light: {root: {background: "rgba(10, 10, 10, 0.92)", color: "{primary.400}"}}}},
    // Text- and outlined-variant buttons (dialog footers) — Lara light uses
    // {green.50}-style washes and {green.200} pastel borders that flash light
    // on dark surfaces. Same translucent washes for both variants; outlined
    // adds a half-opacity severity rim, GW2-window style.
    button: {colorScheme: {light: {
      text: {
        primary:   {hoverBackground: "rgba(255, 204, 119, 0.08)", activeBackground: "rgba(255, 204, 119, 0.15)"},
        success:   {hoverBackground: "rgba(67, 208, 113, 0.10)",  activeBackground: "rgba(67, 208, 113, 0.20)"},
        danger:    {hoverBackground: "rgba(220, 57, 57, 0.10)",   activeBackground: "rgba(220, 57, 57, 0.20)"},
        info:      {hoverBackground: "rgba(36, 162, 231, 0.10)",  activeBackground: "rgba(36, 162, 231, 0.20)"},
        secondary: {hoverBackground: "rgba(255, 204, 119, 0.08)", activeBackground: "rgba(255, 204, 119, 0.15)"},
      },
      outlined: {
        primary:   {borderColor: "rgba(255, 204, 119, 0.5)", color: "{primary.400}",
                    hoverBackground: "rgba(255, 204, 119, 0.08)", activeBackground: "rgba(255, 204, 119, 0.15)"},
        success:   {borderColor: "rgba(67, 208, 113, 0.5)",  color: "{green.500}",
                    hoverBackground: "rgba(67, 208, 113, 0.10)",  activeBackground: "rgba(67, 208, 113, 0.20)"},
        danger:    {borderColor: "rgba(220, 57, 57, 0.5)",   color: "{red.500}",
                    hoverBackground: "rgba(220, 57, 57, 0.10)",   activeBackground: "rgba(220, 57, 57, 0.20)"},
        info:      {borderColor: "rgba(36, 162, 231, 0.5)",  color: "{sky.500}",
                    hoverBackground: "rgba(36, 162, 231, 0.10)",  activeBackground: "rgba(36, 162, 231, 0.20)"},
        secondary: {borderColor: "rgba(255, 204, 119, 0.35)", color: "{surface.600}",
                    hoverBackground: "rgba(255, 204, 119, 0.08)", activeBackground: "rgba(255, 204, 119, 0.15)"},
      },
    }}},
    // p-selectButton renders p-togglebutton; Lara light hoverBackground={surface.100}.
    togglebutton: {colorScheme: {light: {root: {hoverBackground: "rgba(255, 204, 119, 0.08)"}}}},
    // dialog/select/password/inputtext need NO component overrides — semantic tokens cover them.
  },
  // App-level tokens for the chrome CSS → emitted as --p-gw2-* on :root.
  // Literal hex on purpose: {token} ref resolution inside `extend` is unverified.
  extend: {gw2: {
    goldBright: "#ffb71a",                    // ticks / scores / ppt
    goldLabel: "#d8c89a",                     // labels (== surface.600, friendlier name)
    border: "#111111",
    separator: "rgba(255, 204, 119, 0.35)",
    hoverBg: "rgba(255, 204, 119, 0.08)",
    activeBg: "rgba(255, 204, 119, 0.15)",
    teamRed: "#DC3939", teamBlue: "#24A2E7", teamGreen: "#43D071",
    surfaceSticky: "rgba(10, 10, 10, 0.95)",  // match-history sticky header
    surfaceRow: "rgba(0, 0, 0, 0.35)",        // zebra rows
  }},
});
