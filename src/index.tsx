import { extension_helper } from "./helper";
import { initExtension } from "./extension";

function onload({ extensionAPI }: { extensionAPI: RoamExtensionAPI }) {
  initExtension(extensionAPI);
}

function onunload() {
  extension_helper.uninstall();
}

export default {
  onload,
  onunload,
};
