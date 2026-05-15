import { create } from "zustand";
import { defaultBoardSettings } from "../../domain/board/defaults";
import type { BoardEdge } from "../../domain/board/types";

export type WheelZoomMode = "ctrlWheel" | "directWheel";

export type UserSettings = {
  wheelZoomMode: WheelZoomMode;
  defaultEdgeStyle: Pick<BoardEdge, "pathType" | "arrow" | "stroke">;
};

const settingsStorageKey = "freelinkboard:user-settings:v1";

export const defaultUserSettings: UserSettings = {
  wheelZoomMode: "ctrlWheel",
  defaultEdgeStyle: {
    pathType: defaultBoardSettings.edgeStyle.pathType,
    arrow: defaultBoardSettings.edgeStyle.arrow,
    stroke: { ...defaultBoardSettings.edgeStyle.stroke }
  }
};

type SettingsPatch = Partial<
  Pick<UserSettings, "wheelZoomMode"> & {
    defaultEdgeStyle: Partial<Pick<BoardEdge, "pathType" | "arrow">> & {
      stroke?: Partial<BoardEdge["stroke"]>;
    };
  }
>;

type SettingsStore = {
  settings: UserSettings;
  reloadSettings(): void;
  resetSettings(): void;
  updateSettings(patch: SettingsPatch): void;
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: loadSettings(),

  reloadSettings() {
    set({ settings: loadSettings() });
  },

  resetSettings() {
    saveSettings(defaultUserSettings);
    set({ settings: cloneSettings(defaultUserSettings) });
  },

  updateSettings(patch) {
    const nextSettings = mergeSettings(get().settings, patch);
    saveSettings(nextSettings);
    set({ settings: nextSettings });
  }
}));

function loadSettings(): UserSettings {
  if (typeof window === "undefined") {
    return cloneSettings(defaultUserSettings);
  }

  try {
    const rawSettings = window.localStorage.getItem(settingsStorageKey);
    if (!rawSettings) {
      return cloneSettings(defaultUserSettings);
    }

    return mergeSettings(defaultUserSettings, JSON.parse(rawSettings) as SettingsPatch);
  } catch {
    return cloneSettings(defaultUserSettings);
  }
}

function saveSettings(settings: UserSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
}

function mergeSettings(current: UserSettings, patch: SettingsPatch): UserSettings {
  return {
    wheelZoomMode: isWheelZoomMode(patch.wheelZoomMode) ? patch.wheelZoomMode : current.wheelZoomMode,
    defaultEdgeStyle: {
      pathType: isPathType(patch.defaultEdgeStyle?.pathType)
        ? patch.defaultEdgeStyle.pathType
        : current.defaultEdgeStyle.pathType,
      arrow: isArrow(patch.defaultEdgeStyle?.arrow) ? patch.defaultEdgeStyle.arrow : current.defaultEdgeStyle.arrow,
      stroke: {
        color: isHexColor(patch.defaultEdgeStyle?.stroke?.color)
          ? patch.defaultEdgeStyle.stroke.color
          : current.defaultEdgeStyle.stroke.color,
        dash: isDash(patch.defaultEdgeStyle?.stroke?.dash)
          ? patch.defaultEdgeStyle.stroke.dash
          : current.defaultEdgeStyle.stroke.dash,
        width:
          patch.defaultEdgeStyle?.stroke?.width === undefined
            ? current.defaultEdgeStyle.stroke.width
            : clampEdgeWidth(patch.defaultEdgeStyle.stroke.width)
      }
    }
  };
}

function cloneSettings(settings: UserSettings): UserSettings {
  return {
    wheelZoomMode: settings.wheelZoomMode,
    defaultEdgeStyle: {
      pathType: settings.defaultEdgeStyle.pathType,
      arrow: settings.defaultEdgeStyle.arrow,
      stroke: { ...settings.defaultEdgeStyle.stroke }
    }
  };
}

function clampEdgeWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return defaultBoardSettings.edgeStyle.stroke.width;
  }

  return Math.min(12, Math.max(1, Math.round(width)));
}

function isWheelZoomMode(value: unknown): value is WheelZoomMode {
  return value === "ctrlWheel" || value === "directWheel";
}

function isPathType(value: unknown): value is BoardEdge["pathType"] {
  return value === "bezier" || value === "straight" || value === "roundedElbow";
}

function isArrow(value: unknown): value is BoardEdge["arrow"] {
  return value === "none" || value === "end" || value === "both";
}

function isDash(value: unknown): value is BoardEdge["stroke"]["dash"] {
  return value === "solid" || value === "dashed";
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
