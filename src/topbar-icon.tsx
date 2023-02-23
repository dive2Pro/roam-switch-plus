import { useEffect, useRef, useState } from "react";
import ReactDom from "react-dom";
import { Button, Dialog } from "@blueprintjs/core";

import { appendToTopbar, extension_helper } from "./helper";

function Path() {
  const ref = useRef()
  useEffect(() => {
    // @ts-ignore
    window.roamAlphaAPI.ui.components.renderBlock({ el: ref.current, uid: 'p-u0jAL_i', 'zoom-path?': true })
  }, [])
  return < div ref={ref} />
}
function TopbarIcon() {
  const [open, setOpen] = useState(false);


  return (
    <>
      <Button
        icon="switch"
        onClick={() => {
          setOpen((prev) => !prev);
        }}
      />
      {/* <Extension isOpen={open} onClose={() => setOpen(false)} /> */}
      {/* <Dialog isOpen={open} onClose={() => setOpen(false)}>
        <Path />
      </Dialog> */}
    </>
  );
}

export function initTopbarIcon(extensionAPI: RoamExtensionAPI) {
  const topbarIcon = appendToTopbar("Extension-Name");
  ReactDom.render(<TopbarIcon />, topbarIcon);
  extension_helper.on_uninstall(() => {
    topbarIcon.parentElement.removeChild(topbarIcon);
  });
}
