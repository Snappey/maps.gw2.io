import {MenuPanelService} from "../../services/menu-panel.service";
import {ToolbarButton} from "./toolbar.component";

/**
 * The Info / Settings / Layers buttons are identical on both the Tyria and
 * Mists maps. Each map appends its own domain-specific buttons after these.
 */
export function sharedLeftToolbarButtons(menu: MenuPanelService): ToolbarButton[] {
  return [
    {
      Tooltip: "Info",
      Icon: "/assets/about_icon.png",
      IconHover: "/assets/about_hovered_icon.png",
      OnClick: () => menu.toggle("about"),
      PanelId: "about",
    },
    {
      Tooltip: "Settings",
      Icon: "/assets/settings_icon.png",
      IconHover: "/assets/settings_hovered_icon.png",
      OnClick: () => menu.toggle("settings"),
      PanelId: "settings",
    },
    {
      Tooltip: "Layers",
      Icon: "/assets/layer_icon.png",
      IconHover: "/assets/layer_hovered_icon.png",
      OnClick: () => menu.toggle("layers"),
      PanelId: "layers",
      Keybindings: ["Digit1"],
    },
  ];
}
