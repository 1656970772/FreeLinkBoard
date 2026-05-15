import { beforeEach, describe, expect, it } from "vitest";
import { defaultBoardSettings } from "../../../src/domain/board/defaults";
import { defaultUserSettings, useSettingsStore } from "../../../src/renderer/stores/settingsStore";

describe("settingsStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSettingsStore.getState().resetSettings();
  });

  it("starts with Ctrl+wheel zoom and the domain default edge stroke", () => {
    expect(useSettingsStore.getState().settings).toEqual(defaultUserSettings);
    expect(useSettingsStore.getState().settings.defaultEdgeStyle.stroke).toEqual(
      defaultBoardSettings.edgeStyle.stroke
    );
  });

  it("updates wheel mode and persists it to localStorage", () => {
    useSettingsStore.getState().updateSettings({ wheelZoomMode: "directWheel" });

    expect(useSettingsStore.getState().settings.wheelZoomMode).toBe("directWheel");

    useSettingsStore.getState().reloadSettings();

    expect(useSettingsStore.getState().settings.wheelZoomMode).toBe("directWheel");
  });

  it("updates default edge color and clamps edge width", () => {
    useSettingsStore.getState().updateSettings({
      defaultEdgeStyle: {
        stroke: {
          color: "#d14f2f",
          width: 99
        }
      }
    });

    expect(useSettingsStore.getState().settings.defaultEdgeStyle.stroke).toEqual({
      color: "#d14f2f",
      dash: "solid",
      width: 12
    });
  });

  it("ignores invalid persisted settings values", () => {
    window.localStorage.setItem(
      "freelinkboard:user-settings:v1",
      JSON.stringify({
        wheelZoomMode: "wild",
        defaultEdgeStyle: {
          pathType: "spiral",
          arrow: "sideways",
          stroke: {
            color: "tomato",
            dash: "sometimes",
            width: Number.NaN
          }
        }
      })
    );

    useSettingsStore.getState().reloadSettings();

    expect(useSettingsStore.getState().settings).toEqual(defaultUserSettings);
  });
});
