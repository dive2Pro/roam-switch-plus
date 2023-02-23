type RoamExtensionAPI = {
  settings: {
    get: (k: string) => unknown;
    getAll: () => Record<string, unknown>;
    panel: {
      create: (c: PanelConfig) => void;
    };
    set: (k: string, v: unknown) => Promise<void>;
  };
  ui: {
    commandPalette: {
      addCommand: (param: {
        label: string;
        "default-hotkey"?: string | string[];
        callback?: () => void;
        "disable-hotkey"?: boolean
      }) => void;
    }
  }
};
